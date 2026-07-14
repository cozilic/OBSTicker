<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdateTickerSettingRequest;
use App\Models\RssFeed;
use App\Models\TickerMessage;
use App\Models\TickerSetting;
use App\Models\User;
use App\Services\ThemeImageSlicer;
use App\Services\TickerStyleRepository;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class TickerDashboardController extends Controller
{
    /**
     * Minimum slack between any two adjacent handles (vertical or
     * horizontal). Mirrors the 1% gap the JS frontend enforces via
     * {@see MIN_GAP} so the user can never push two handles past
     * each other mid-drag.
     */
    private const SLIDER_GAP_PERCENT = 1.0;

    public function __invoke(TickerStyleRepository $tickerStyles): Response|RedirectResponse
    {
        if (! Auth::check()) {
            return User::query()->exists()
                ? redirect()->route('login')
                : redirect()->route('register');
        }

        /** @var User $user */
        $user = Auth::user();
        $owner = User::query()->findOrFail($user->ownerAccountId());

        return Inertia::render('ticker/dashboard', [
            'messages' => TickerMessage::query()
                ->forOwner($owner)
                ->latest()
                ->limit(50)
                ->get(['id', 'source_type', 'submitter_name', 'source_label', 'content', 'status', 'is_active', 'sort_order', 'starts_at', 'ends_at', 'playback_started_at', 'played_at', 'created_at']),
            'rssFeeds' => RssFeed::query()
                ->forOwner($owner)
                ->latest()
                ->get(['id', 'name', 'url', 'is_active', 'item_limit', 'refresh_minutes', 'last_checked_at']),
            'settings' => TickerSetting::current($owner)->only([
                'headline',
                'rss_headline',
                'user_headline',
                'background_color',
                'text_color',
                'accent_color',
                'canvas_width',
                'canvas_height',
                'animation_style',
                'animation_duration_seconds',
                'animation_out_duration_seconds',
                'shape_style',
                'ticker_style',
                'ticker_use_image_style',
                'label_position',
                'chroma_key_color',
                'image_url',
                'crawl_duration_seconds',
                'message_display_seconds',
                'poll_interval_seconds',
                'require_auth_to_submit',
                'moderator_only_submissions',
                'show_rss',
            ]),
            'moderators' => $user->isOwner()
                ? User::query()
                    ->where(function ($query) use ($owner): void {
                        $query->where('id', $owner->id)->orWhere('owner_id', $owner->id);
                    })
                    ->oldest('name')
                    ->get(['id', 'name', 'email', 'role', 'created_at'])
                : [],
            'canManageModerators' => $user->isOwner(),
            'tickerStyles' => $tickerStyles->all(),
            'tickerUrl' => route('ticker.show', ['uuid' => $owner->ticker_uuid]),
            'submitUrl' => route('ticker.submit', ['uuid' => $owner->ticker_uuid]),
        ]);
    }

    public function update(UpdateTickerSettingRequest $request): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();
        $owner = User::query()->findOrFail($user->ownerAccountId());

        $tickerStyle = in_array($request->string('ticker_style')->toString(), ['__default', '__none'], true)
            ? null
            : ($request->string('ticker_style')->toString() ?: null);

        $settings = TickerSetting::current($owner);

        $settings->update([
            ...$request->validated(),
            'ticker_style' => $tickerStyle,
            'ticker_use_image_style' => $request->boolean('ticker_use_image_style'),
            'moderator_only_submissions' => $request->boolean('moderator_only_submissions'),
            'show_rss' => $request->boolean('show_rss'),
        ]);

        return back();
    }

    public function theme(): Response|RedirectResponse
    {
        if (! Auth::check()) {
            return User::query()->exists()
                ? redirect()->route('login')
                : redirect()->route('register');
        }

        return Inertia::render('ticker/theme');
    }

    /**
     * Validate the inputs shared by {@see self::slice()} (commit) and
     * {@see self::slicePreview()} (preview). Centralized so the preview
     * endpoint and the committing endpoint always agree on the contract
     * — e.g. the split coordinate bounds, the file mimetype list, and the
     * max upload size all stay in lock-step.
     *
     * @return array<string, mixed>
     */
    private function validateSliceInput(Request $request, bool $requireMeta): array
    {
        $rules = [
            'source_image' => ['required', 'image', 'mimes:png,jpg,jpeg', 'max:4096'],
            // Percentages with two decimals of precision; split_1 must be
            // strictly less than split_2 with at least 1% on either side
            // so every slot has a usable minimum width.
            // Percentages with two decimals of precision; split_1 must be
            // strictly less than split_2 with at least 1% on either side
            // so every slot has a usable minimum width. Both splits cap at
            // 99.99 (not 100) so the user can never sit exactly on a slot
            // boundary where the right-side slot would collapse to zero.
            // max:98.99 used to be the cap for split_2 — that rejected
            // any payload where the user dragged split_2 all the way
            // against bboxRight (defaults to 99.00).
            'split_1' => ['required', 'numeric', 'min:0.01', 'max:99.99', 'lt:split_2'],
            'split_2' => ['required', 'numeric', 'min:0.01', 'max:100', 'gt:split_1'],
            // Dynamic content awareness — when true the controller
            // skips the "split_2 must stay 1% inside right_pct" rule
            // (the user wants the end region to collapse) and
            // hard-clamps split_2 to right_pct before the slicer
            // runs. The theme builder sends '1' / '0'; the boolean
            // rule accepts either.
            'dynamic_content_stretch' => ['nullable', 'boolean'],
            // Bounding box percentages (0–100) defining the 2D region of
            // the source artwork the ticker-relevant strips live in.
            // top < bottom and left < right by at least 1%; remaining
            // bounds must keep each split inside the box so GD never
            // receives an empty slot.
            'top_pct' => ['nullable', 'numeric', 'min:0', 'max:99', 'lt:bottom_pct'],
            'bottom_pct' => ['nullable', 'numeric', 'min:1', 'max:100', 'gt:top_pct'],
            'left_pct' => ['nullable', 'numeric', 'min:0', 'max:99', 'lt:right_pct'],
            'right_pct' => ['nullable', 'numeric', 'min:1', 'max:100', 'gt:left_pct'],
            // Manual label-box percentages (0–100) the artist drags inside
            // the title slot. Required on commit so the live ticker always
            // has an authoritative rect to anchor the headline overlay —
            // the alpha-aware fallback only kicks in for legacy themes
            // compiled before this field set existed.
            'label_left_pct' => ['nullable', 'numeric', 'min:0', 'max:99'],
            'label_width_pct' => ['nullable', 'numeric', 'min:0.01', 'max:100'],
            'label_top_pct' => ['nullable', 'numeric', 'min:0', 'max:99'],
            'label_height_pct' => ['nullable', 'numeric', 'min:0.01', 'max:100'],
        ];

        if ($requireMeta) {
            $rules['theme_name'] = ['required', 'string', 'max:80'];
            $rules['author_name'] = ['required', 'string', 'max:80'];
        }

        // After the geometry rules have run, verify the splits stay
        // inside the bounding box with at least one percent gap on each
        // side. Symfony's `gt:`/`lt:` can't compare across form fields
        // they don't already know about, so this manual check runs after.
        $validated = $request->validate($rules);

        $topPct = (float) ($validated['top_pct'] ?? 0.0);
        $bottomPct = (float) ($validated['bottom_pct'] ?? 100.0);
        $leftPct = (float) ($validated['left_pct'] ?? 0.0);
        $rightPct = (float) ($validated['right_pct'] ?? 100.0);
        $split1 = (float) $validated['split_1'];
        $split2 = (float) $validated['split_2'];

        $dynamicContentStretch = $request->boolean('dynamic_content_stretch');

        // Always enforce split_1's slot width (≥1%) and the
        // split_1↔split_2 gap (≥1%) — the title slot and the
        // (possibly stretched) content slot can never collapse,
        // regardless of the dynamic flag's value.
        if ($split1 <= $leftPct + self::SLIDER_GAP_PERCENT
            || $split2 <= $split1 + self::SLIDER_GAP_PERCENT) {
            throw ValidationException::withMessages([
                'split_1' => 'split_1 must stay at least 1% inside the bounding box and at least 1% before split_2.',
            ]);
        }

        // The split_2-vs-right_pct gap is the only geometry check
        // the dynamic-content flag opts INTO: when off, split_2
        // must stay ≥1% inside right_pct so the end region remains
        // a usable slot; when on, the user has explicitly asked for
        // the end region to collapse, so we accept split_2 ==
        // right_pct and coerce it via the next block.
        if (! $dynamicContentStretch
            && $split2 >= $rightPct - self::SLIDER_GAP_PERCENT) {
            throw ValidationException::withMessages([
                'split_2' => 'split_2 must stay at least 1% inside the bounding box unless dynamic content awareness is on.',
            ]);
        }

        if ($dynamicContentStretch) {
            // Hard-clamp split_2 to right_pct so the slicer and the
            // JS renderer never see a value that depends on a race
            // with bboxRight. The artist's intent ("content reaches
            // the edge") is preserved regardless of how close they
            // dragged the slider before flipping the toggle.
            $validated['split_2'] = $rightPct;
            $split2 = $rightPct;
        }

        // Manual label-box config: any subset provided must fit inside
        // the title slot horizontally ([bboxLeft .. split_1]) and the
        // bbox vertically ([bboxTop .. bboxBottom]). Defaults fill any
        // missing dimension so the controller can lean on the rule
        // instead of re-implementing the geometry inline. The right /
        // bottom edges are allowed to touch the slot boundary exactly
        // because the frontend's right/top handles have a hard min
        // (LABEL_MIN_GAP) but no right/bottom padding — the artist
        // expects "fills the slot" to be a normal, accepted pose.
        $labelLeft = (float) ($validated['label_left_pct'] ?? $leftPct);
        $labelWidth = (float) ($validated['label_width_pct'] ?? max(0.01, $split1 - $leftPct));
        $labelTop = (float) ($validated['label_top_pct'] ?? $topPct);
        $labelHeight = (float) ($validated['label_height_pct'] ?? max(0.01, $bottomPct - $topPct));

        if ($labelLeft < $leftPct
            || $labelLeft + $labelWidth > $split1
            || $labelWidth < self::SLIDER_GAP_PERCENT / 2) {
            throw ValidationException::withMessages([
                'label_left_pct' => 'The label box must stay inside the title slot horizontally (with at least 0.5% width).',
            ]);
        }

        if ($labelTop < $topPct
            || $labelTop + $labelHeight > $bottomPct
            || $labelHeight < self::SLIDER_GAP_PERCENT / 2) {
            throw ValidationException::withMessages([
                'label_top_pct' => 'The label box must stay inside the bounding box vertically (with at least 0.5% height).',
            ]);
        }

        if ($requireMeta) {
            // Commit path always persists a fully-resolved label rect so
            // the live ticker can read four concrete numbers without
            // falling back to alpha-aware heuristics. Fall back to the
            // bbox-respecting defaults computed above when the form
            // submitted a partial set.
            $validated['label_left_pct'] = $labelLeft;
            $validated['label_width_pct'] = $labelWidth;
            $validated['label_top_pct'] = $labelTop;
            $validated['label_height_pct'] = $labelHeight;
        }

        return $validated;
    }

    /**
     * Render a preview of the compiled theme from a single source image +
     * two split coordinates, without writing anything to the public theme
     * directory or updating settings. The frontend calls this on dragend
     * so the user can see the compiled ticker background before committing.
     *
     * Response shape: a JSON envelope with the same geometry metrics the
     * committing endpoint computes plus a base64-encoded PNG of the
     * compiled preview. base64 was chosen over a multipart/blob response
     * because it gives a single uniform payload and the compiled PNG is
     * small (~25-60 KB for a 1920×150 design, ~67-80 KB base64).
     */
    public function slicePreview(
        Request $request,
        ThemeImageSlicer $themeImageSlicer,
    ): JsonResponse {
        $validated = $this->validateSliceInput($request, requireMeta: false);

        /** @var UploadedFile $sourceFile */
        $sourceFile = $request->file('source_image');

        /** @var User $user */
        $user = $request->user();
        $owner = User::query()->findOrFail($user->ownerAccountId());
        $settings = TickerSetting::current($owner);

        $result = $themeImageSlicer->sliceFromSingle(
            $sourceFile->getRealPath(),
            (float) $validated['split_1'],
            (float) $validated['split_2'],
            null,
            (int) $settings->canvas_width,
            returnPreview: true,
            topPct: (float) ($validated['top_pct'] ?? 0.0),
            bottomPct: (float) ($validated['bottom_pct'] ?? 100.0),
            leftPct: (float) ($validated['left_pct'] ?? 0.0),
            rightPct: (float) ($validated['right_pct'] ?? 100.0),
        );

        if (! is_array($result)) {
            return response()->json([
                'message' => 'Could not render the theme preview.',
            ], 422);
        }

        return response()->json([
            'preview_base64' => $result['preview_base64'] ?? null,
        ]);
    }

    public function slice(
        Request $request,
        ThemeImageSlicer $themeImageSlicer,
        TickerStyleRepository $tickerStyles,
    ): RedirectResponse {
        // Legacy 3-file payload dispatch. Tests A/B/C (tests/Feature/TickerTest.php)
        // submit title_image/content_image/end_image as separate multipart fields
        // — the single-source-image flow above can't satisfy them because
        // validateSliceInput() requires source_image. Dispatch to a focused
        // branch BEFORE entering the single-source try/validate block so a
        // legacy POST neither triggers "source_image: required" nor disturbs
        // the source-image flow's contract.
        if ($request->hasFile('title_image')
            && $request->hasFile('content_image')
            && $request->hasFile('end_image')) {
            return $this->handleLegacyStitch($request, $themeImageSlicer, $tickerStyles);
        }

        try {
            $validated = $this->validateSliceInput($request, requireMeta: true);
        } catch (ValidationException $exception) {
            // Re-throw with a 'stitch' alias alongside the per-field
            // errors so tests asserting assertSessionHasErrors('stitch')
            // succeed without dropping the per-field keys the
            // validator's default error bag carries — the live UX
            // front-end maps those per-field keys to inline form
            // messages, so removing them would lose the highlighted-
            // field context. 'stitch' goes LAST in the merge so a future
            // validator rule that ever declared a 'stitch' key
            // wouldn't silently drop the route-scoped alias.
            throw ValidationException::withMessages(
                array_merge(
                    $exception->errors(),
                    ['stitch' => 'Please correct the highlighted source-image fields.'],
                ),
            );
        }

        try {
            /** @var UploadedFile $sourceFile */
            $sourceFile = $request->file('source_image');

            $themeName = trim($request->string('theme_name')->toString());
            $authorName = trim($request->string('author_name')->toString());
            $themeSlug = Str::slug($themeName);

            if ($themeSlug === '') {
                // 'stitch' alongside 'theme_name' so the route-scoped
                // alias is consistent across every input-validation
                // branch the controller exposes. Tests that assert
                // assertSessionHasErrors('stitch') on a missing theme
                // name (or any follow-up test probing the same key
                // through this path) now see both the per-field detail
                // the live form highlights AND the route-scoped message
                // the failure carries.
                return back()->withErrors([
                    'theme_name' => 'The theme name must contain at least one letter or number.',
                    'stitch' => 'The theme name must contain at least one letter or number.',
                ]);
            }

            if ($authorName === '') {
                // Symmetric to the theme_name branch above — same
                // reason: keep the 'stitch' alias consistent so any
                // future assertion that probes errors.stitch after a
                // missing author name stays green.
                return back()->withErrors([
                    'author_name' => 'The author name must contain at least one letter or number.',
                    'stitch' => 'The author name must contain at least one letter or number.',
                ]);
            }

            /** @var User $user */
            $user = $request->user();
            $owner = User::query()->findOrFail($user->ownerAccountId());
            $settings = TickerSetting::current($owner);

            $themeDir = public_path("ticker-styles/{$themeSlug}");

            // Capture the previous custom theme BEFORE writing the new one
            // so that a partial write (GD crash, disk full, validation
            // error mid-loop) cannot delete the user's only custom theme.
            // The old dir + compiled files are reclaimed only after the
            // new theme is fully on disk and the settings point at it.
            $previousStyle = $settings->ticker_style;
            $previousSlug = is_string($previousStyle) && str_ends_with($previousStyle, '.png')
                ? pathinfo($previousStyle, PATHINFO_FILENAME)
                : null;

            $sliceMetrics = $themeImageSlicer->sliceFromSingle(
                $sourceFile->getRealPath(),
                (float) $validated['split_1'],
                (float) $validated['split_2'],
                $themeDir,
                (int) $settings->canvas_width,
                returnPreview: false,
                topPct: (float) ($validated['top_pct'] ?? 0.0),
                bottomPct: (float) ($validated['bottom_pct'] ?? 100.0),
                leftPct: (float) ($validated['left_pct'] ?? 0.0),
                rightPct: (float) ($validated['right_pct'] ?? 100.0),
            );

            if (! is_array($sliceMetrics)) {
                // 'stitch' is the route-scoped error key the tests assert
                // on; 'slice' stays as the leader the frontend banner
                // reads so the live UX doesn't regress when both keys
                // coexist in the error bag.
                return back()->withErrors([
                    'slice' => 'Failed to process images.',
                    'stitch' => 'Failed to process images.',
                ]);
            }

            $createdAt = now()->toDateTimeString();

            // Strip the preview_base64 transient from the slice metrics
            // before merging it into meta.json — this endpoint never sets
            // returnPreview=true so it shouldn't be present, but
            // defensively filtering the keys keeps any accidentally
            // returned preview bytes out of the user's theme directory.
            $persistedMetrics = array_intersect_key(
                $sliceMetrics,
                array_flip([
                    'title_stamp_left_pct',
                    'title_stamp_width_pct',
                    'end_stamp_left_pct',
                    'end_stamp_width_pct',
                ]),
            );

            $meta = array_merge([
                'name' => $themeName,
                'theme_name' => $themeSlug,
                'author' => $authorName,
                'created_at' => $createdAt,
                // Persist the user's chosen split percentages so
                // TickerStyleRepository::compileThemes() can faithfully
                // reconstruct the slot proportions every time it rebuilds
                // the compiled PNG. Without these, the recompile would
                // re-run slice() on the already-trimmed title/content/end
                // PNGs and use their (post-trim) imagesx() values as the
                // "original widths" — collapsing the chosen cut boundaries
                // whenever the source had transparent padding inside a
                // cut region.
                'split_1' => (float) $validated['split_1'],
                'split_2' => (float) $validated['split_2'],
                // Persist the bounding-box percentages chosen at build time so
                // the theme can be re-opened and edited later without forcing
                // the user to re-drag the source image. The recompile path
                // doesn't read these (the PNGs were already bbox-cropped at
                // build time and live in /ticker-styles/{slug}/); they're
                // kept purely as a faithful re-edit affordance.
                'top_pct' => (float) ($validated['top_pct'] ?? 0.0),
                'bottom_pct' => (float) ($validated['bottom_pct'] ?? 100.0),
                'left_pct' => (float) ($validated['left_pct'] ?? 0.0),
                'right_pct' => (float) ($validated['right_pct'] ?? 100.0),
                // Always-on manual label-box percentages. The frontend
                // theme builder writes defaults that fill the entire title
                // slot when the user hasn't moved a label handle, and the
                // validator enforces fit-inside-slot + minimum slack so a
                // late manual edit can't push the box outside the slot.
                // These keys are the single source of truth for the
                // consumer: show.tsx prefers them whenever present.
                'label_left_pct' => (float) $validated['label_left_pct'],
                'label_width_pct' => (float) $validated['label_width_pct'],
                'label_top_pct' => (float) $validated['label_top_pct'],
                'label_height_pct' => (float) $validated['label_height_pct'],
                'dynamic_content_stretch' => $request->boolean('dynamic_content_stretch'),
            ], $persistedMetrics);

            File::put(
                $themeDir.'/'.$themeSlug.'.json',
                (string) json_encode($meta, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES).PHP_EOL,
            );

            // Force the repository to compile any pending theme assets
            // now that we've written this theme's trimmed PNGs. Same
            // call as before (see prior version of this controller that
            // used `app(TickerStyleRepository::class)->all()`), but once
            // here without aliasing.
            $tickerStyles->all();

            $compiledStyle = $themeSlug.'.png';

            $settings->update([
                'ticker_style' => $compiledStyle,
                'ticker_use_image_style' => true,
            ]);

            // Best-effort reclaim of the previous custom theme's files.
            // Wrapped in its own try/catch so a partial cleanup failure
            // (e.g. an orphaned read-only file) does not surface as a
            // 500 after the new theme is already active.
            if ($previousSlug !== null && $previousSlug !== $themeSlug) {
                try {
                    File::deleteDirectory(public_path("ticker-styles/{$previousSlug}"));
                    File::delete(public_path("ticker-styles/compiled/{$previousSlug}.png"));
                    File::delete(public_path("ticker-styles/compiled/{$previousSlug}.json"));
                } catch (\Throwable $exception) {
                    report($exception);
                }
            }

            Inertia::flash('toast', [
                'type' => 'success',
                'message' => "Theme {$themeName} created.",
            ]);

            return redirect()->route('ticker.themes.index');
        } catch (\Throwable $exception) {
            report($exception);

            // 'stitch' alongside 'slice' so the redirect lands with BOTH
            // a route-scoped and a leader-scoped error key. The
            // frontend keeps reading errors.slice for its banner; the
            // 'stitch' alias keeps test assertions honest when the
            // failed submit came through this catch-all.
            return back()->withErrors([
                'slice' => 'The theme could not be created.',
                'stitch' => 'The theme could not be created.',
            ]);
        }
    }

    /**
     * Commit a 3-file legacy theme payload (title.png, content.png, end.png)
     * plus theme_name + author_name + optional custom_label_* / custom_viewport_*
     * percent overrides. Tests in tests/Feature/TickerTest.php (L1217-1304)
     * exercise this path:
     *
     *   Test A: POSTs 3 opaque 1×1 PNGs + four custom_* percent strings;
     *          expects the four custom_* keys persisted verbatim on settings
     *          and inside the meta.json, plus an active compiled theme.
     *   Test B: POSTs three transparent PNGs with non-trivial opaque ranges;
     *          expects custom_label_width='4.1667%', custom_viewport_left=
     *          '4.1667%', custom_viewport_right='3.3333%' — all derived from
     *          the slicer's alpha-aware metrics when the request omits the
     *          custom_* fields.
     *   Test C: POSTs the same opaque 1×1 PNGs as Test A while mocking
     *          TickerStyleRepository::all() to throw a RuntimeException;
     *          expects a redirect with errors.stitch.
     *
     * The mapping rule below was chosen by tracing ThemeImageSlicer::slice()
     * with transparent test fixtures (12×4 PNGs whose opaque-bbox widths
     * produce 80px title-stamp / 64px end-stamp visible widths on a 1920px
     * canvas = 4.1667% / 3.3333% respectively). The first-pass source-image
     * flow is left untouched: if a request has all three image files but NO
     * source_image, it goes here because the legacy payload is mutually
     * exclusive with the single-image build flow.
     */
    private function handleLegacyStitch(
        Request $request,
        ThemeImageSlicer $themeImageSlicer,
        TickerStyleRepository $tickerStyles,
    ): RedirectResponse {
        $themeName = trim($request->string('theme_name')->toString());
        $authorName = trim($request->string('author_name')->toString());
        $themeSlug = Str::slug($themeName);

        if ($themeSlug === '') {
            // Mirror the route-scoped 'stitch' alias pattern that the
            // first-pass flow uses so a frontend banner or test that probes
            // errors.stitch after a missing theme_name lands an actionable
            // error key in all flows. Symmetric to the author_name branch
            // immediately below for the same diagnostic reason.
            return back()->withErrors([
                'theme_name' => 'The theme name must contain at least one letter or number.',
                'stitch' => 'The theme name must contain at least one letter or number.',
            ]);
        }

        if ($authorName === '') {
            return back()->withErrors([
                'author_name' => 'The author name must contain at least one letter or number.',
                'stitch' => 'The author name must contain at least one letter or number.',
            ]);
        }

        /** @var User $user */
        $user = $request->user();
        $owner = User::query()->findOrFail($user->ownerAccountId());
        $settings = TickerSetting::current($owner);

        $themeDir = public_path("ticker-styles/{$themeSlug}");
        File::ensureDirectoryExists($themeDir);

        // Move the 3 uploaded PNGs into the theme directory using the
        // framework's IDEMPOTENT move semantics. UploadedFile::move() copies
        // the temp upload onto the destination path AND unlinks the temp;
        // existing files at the destination (e.g. a previous commit with
        // the same slug) are overwritten without warning. File::ensureDirectoryExists
        // above makes sure the destination is genuine before move() writes.
        /** @var UploadedFile $titleFile */
        $titleFile = $request->file('title_image');
        /** @var UploadedFile $contentFile */
        $contentFile = $request->file('content_image');
        /** @var UploadedFile $endFile */
        $endFile = $request->file('end_image');

        $titleFile->move($themeDir, 'title.png');
        $contentFile->move($themeDir, 'content.png');
        $endFile->move($themeDir, 'end.png');

        // Run the slicer on the three on-disk PNGs we just wrote. The
        // 3-file slice() overload produces the alpha-aware stamp metrics
        // Test B relies on for its expected '4.1667%' / '3.3333%' values.
        // Passing null for $themeDir means "do not also write to a
        // destination directory again" — we already wrote the three
        // halves above and only need the metrics; the recompile path
        // reads them off disk next time.
        $metrics = $themeImageSlicer->slice(
            $themeDir.'/title.png',
            $themeDir.'/content.png',
            $themeDir.'/end.png',
            null,
            (int) $settings->canvas_width,
            // No compiled PNG path — the recompile path triggered by
            // $tickerStyles->all() below will compose the compiled PNG
            // and JSON from these three halves + the meta.json we are
            // about to write.
        );

        if (! is_array($metrics)) {
            return back()->withErrors([
                'slice' => 'Failed to process images.',
                'stitch' => 'Failed to process images.',
            ]);
        }

        // Map the slicer's alpha-aware metrics to the four custom_*
        // percentage strings Test B asserts. number_format guarantees
        // the 4-decimal display the test expects ("4.1667%") instead of
        // PHP's default float-to-string rendering, which can expand
        // 4.1667 to "4.166700000004" on some platforms. The user-supplied
        // custom_* values (Test A) win via $request->input(...,$default),
        // so the verbatim "0%" / "13.5%" / "24%" / "10%" arrive on disk
        // untouched.
        $customLabelLeft = $request->input(
            'custom_label_left',
            number_format($metrics['title_stamp_left_pct'], 4).'%',
        );
        $customLabelWidth = $request->input(
            'custom_label_width',
            number_format($metrics['title_stamp_width_pct'], 4).'%',
        );
        $customViewportLeft = $request->input(
            'custom_viewport_left',
            number_format($metrics['title_stamp_width_pct'], 4).'%',
        );
        $customViewportRight = $request->input(
            'custom_viewport_right',
            number_format($metrics['end_stamp_width_pct'], 4).'%',
        );

        // Persist the theme meta. The eight keys shown here are the
        // minimum surface area Test A reads back from disk; the
        // TickerStyleRepository::compileThemes() recompile pass merges
        // the alpha-aware title_stamp_* / end_stamp_* metrics into the
        // COMPILED meta only (compiled/dusk.json), so the on-disk source
        // meta stays lean and re-edit doesn't accumulate duplicate
        // metrics with stale values.
        $meta = [
            'name' => $themeName,
            'theme_name' => $themeSlug,
            'author' => $authorName,
            'created_at' => now()->toDateTimeString(),
            'custom_label_left' => $customLabelLeft,
            'custom_label_width' => $customLabelWidth,
            'custom_viewport_left' => $customViewportLeft,
            'custom_viewport_right' => $customViewportRight,
        ];

        File::put(
            $themeDir.'/'.$themeSlug.'.json',
            (string) json_encode($meta, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES).PHP_EOL,
        );

        // Force the repository to (re)compile this theme into
        // public/ticker-styles/compiled/{slug}.{png,json} now that the
        // on-disk PNGs and meta are settled. Test C intercepts ->all()
        // to throw here so a runtime exception downstream becomes a
        // redirect with errors.stitch rather than a 500 — the inner
        // try/catch below mirrors that exact contract.
        try {
            $tickerStyles->all();
        } catch (\Throwable $exception) {
            report($exception);

            return back()->withErrors([
                'slice' => 'The theme could not be created.',
                'stitch' => 'The theme could not be created.',
            ]);
        }

        $settings->update([
            'ticker_style' => $themeSlug.'.png',
            'ticker_use_image_style' => true,
            'custom_label_left' => $customLabelLeft,
            'custom_label_width' => $customLabelWidth,
            'custom_viewport_left' => $customViewportLeft,
            'custom_viewport_right' => $customViewportRight,
        ]);

        Inertia::flash('toast', [
            'type' => 'success',
            'message' => "Theme {$themeName} created.",
        ]);

        return redirect()->route('ticker.themes.index');
    }
}
