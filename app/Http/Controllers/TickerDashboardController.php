<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdateTickerSettingRequest;
use App\Models\RssFeed;
use App\Models\TickerMessage;
use App\Models\TickerSetting;
use App\Models\User;
use App\Services\TickerStyleRepository;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class TickerDashboardController extends Controller
{
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
                'custom_label_left',
                'custom_label_width',
                'custom_viewport_left',
                'custom_viewport_right',
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

        if ($tickerStyle === null || ! str_starts_with($tickerStyle, 'stitched-')) {
            $settings->update([
                'custom_label_left' => null,
                'custom_label_width' => null,
                'custom_viewport_left' => null,
                'custom_viewport_right' => null,
            ]);
        }

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

    public function stitch(Request $request): RedirectResponse
    {
        $request->validate([
            'theme_name' => ['required', 'string', 'max:80'],
            'author_name' => ['required', 'string', 'max:80'],
            'title_image' => ['required_without:left_image', 'nullable', 'image', 'mimes:png,jpg,jpeg', 'max:4096'],
            'content_image' => ['required_without:middle_image', 'nullable', 'image', 'mimes:png,jpg,jpeg', 'max:4096'],
            'end_image' => ['required_without:right_image', 'nullable', 'image', 'mimes:png,jpg,jpeg', 'max:4096'],
            'left_image' => ['required_without:title_image', 'nullable', 'image', 'mimes:png,jpg,jpeg', 'max:4096'],
            'middle_image' => ['required_without:content_image', 'nullable', 'image', 'mimes:png,jpg,jpeg', 'max:4096'],
            'right_image' => ['required_without:end_image', 'nullable', 'image', 'mimes:png,jpg,jpeg', 'max:4096'],
            'custom_label_left' => ['nullable', 'string', 'max:32'],
            'custom_label_width' => ['nullable', 'string', 'max:32'],
            'custom_viewport_left' => ['nullable', 'string', 'max:32'],
            'custom_viewport_right' => ['nullable', 'string', 'max:32'],
        ]);

        try {

            /** @var UploadedFile $leftFile */
            $leftFile = $request->file('title_image') ?? $request->file('left_image');
            /** @var UploadedFile $middleFile */
            $middleFile = $request->file('content_image') ?? $request->file('middle_image');
            /** @var UploadedFile $rightFile */
            $rightFile = $request->file('end_image') ?? $request->file('right_image');

            $themeName = trim($request->string('theme_name')->toString());
            $authorName = trim($request->string('author_name')->toString());
            $themeSlug = Str::slug($themeName);

            if ($themeSlug === '') {
                return back()->withErrors(['theme_name' => 'The theme name must contain at least one letter or number.']);
            }

            if ($authorName === '') {
                return back()->withErrors(['author_name' => 'The author name must contain at least one letter or number.']);
            }

            $leftImg = imagecreatefromstring((string) file_get_contents($leftFile->getRealPath()));
            $middleImg = imagecreatefromstring((string) file_get_contents($middleFile->getRealPath()));
            $rightImg = imagecreatefromstring((string) file_get_contents($rightFile->getRealPath()));

            if (! $leftImg || ! $middleImg || ! $rightImg) {
                return back()->withErrors(['stitch' => 'Failed to process images.']);
            }

            $totalWidth = 1920;
            $height = imagesy($leftImg);

            // Clamp height to a reasonable range
            $height = max(32, min(512, $height));

            $origLeftWidth = imagesx($leftImg);
            $origLeftHeight = imagesy($leftImg);
            $leftWidth = (int) round($origLeftWidth * ($height / $origLeftHeight));

            $origRightWidth = imagesx($rightImg);
            $origRightHeight = imagesy($rightImg);
            $rightWidth = (int) round($origRightWidth * ($height / $origRightHeight));

            // Limit maximum width of left and right parts to 40% of total width
            $maxPartWidth = (int) ($totalWidth * 0.4);
            if ($leftWidth > $maxPartWidth) {
                $leftWidth = $maxPartWidth;
            }
            if ($rightWidth > $maxPartWidth) {
                $rightWidth = $maxPartWidth;
            }

            $middleWidth = $totalWidth - $leftWidth - $rightWidth;

            // Create transparent target image
            $stitchedImg = imagecreatetruecolor($totalWidth, $height);
            imagealphablending($stitchedImg, false);
            imagesavealpha($stitchedImg, true);
            $transparent = imagecolorallocatealpha($stitchedImg, 0, 0, 0, 127);
            if ($transparent !== false) {
                imagefill($stitchedImg, 0, 0, $transparent);
            }
            imagealphablending($stitchedImg, true);

            // Copy and resize parts
            imagecopyresampled($stitchedImg, $leftImg, 0, 0, 0, 0, $leftWidth, $height, $origLeftWidth, $origLeftHeight);
            imagecopyresampled($stitchedImg, $middleImg, $leftWidth, 0, 0, 0, $middleWidth, $height, imagesx($middleImg), imagesy($middleImg));
            imagecopyresampled($stitchedImg, $rightImg, $totalWidth - $rightWidth, 0, 0, 0, $rightWidth, $height, $origRightWidth, $origRightHeight);

            /** @var User $user */
            $user = Auth::user();
            $owner = User::query()->findOrFail($user->ownerAccountId());
            $settings = TickerSetting::current($owner);

            $computedCustomLabelLeft = '0%';
            $computedCustomLabelWidth = round(($leftWidth / $totalWidth) * 100, 4).'%';
            $computedCustomViewportLeft = round(($leftWidth / $totalWidth) * 100, 4).'%';
            $computedCustomViewportRight = round(($rightWidth / $totalWidth) * 100, 4).'%';
            $customLabelLeft = $request->string('custom_label_left')->toString() ?: $computedCustomLabelLeft;
            $customLabelWidth = $request->string('custom_label_width')->toString() ?: $computedCustomLabelWidth;
            $customViewportLeft = $request->string('custom_viewport_left')->toString() ?: $computedCustomViewportLeft;
            $customViewportRight = $request->string('custom_viewport_right')->toString() ?: $computedCustomViewportRight;
            $createdAt = now()->toDateTimeString();

            $themeDir = public_path("ticker-styles/{$themeSlug}");
            File::ensureDirectoryExists($themeDir);

            File::put($themeDir.'/title.png', (string) file_get_contents($leftFile->getRealPath()));
            File::put($themeDir.'/content.png', (string) file_get_contents($middleFile->getRealPath()));
            File::put($themeDir.'/end.png', (string) file_get_contents($rightFile->getRealPath()));

            $meta = [
                'name' => $themeName,
                'theme_name' => $themeSlug,
                'author' => $authorName,
                'created_at' => $createdAt,
                'custom_label_left' => $customLabelLeft,
                'custom_label_width' => $customLabelWidth,
                'custom_viewport_left' => $customViewportLeft,
                'custom_viewport_right' => $customViewportRight,
            ];
            File::put(
                $themeDir.'/'.$themeSlug.'.json',
                (string) json_encode($meta, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES).PHP_EOL,
            );

            app(TickerStyleRepository::class)->all();

            $oldStyle = $settings->ticker_style;
            if ($oldStyle && str_starts_with($oldStyle, 'stitched-')) {
                $oldPath = public_path("ticker-styles/{$oldStyle}");
                if (is_file($oldPath)) {
                    @unlink($oldPath);
                }
                $oldJsonPath = public_path('ticker-styles/'.pathinfo($oldStyle, PATHINFO_FILENAME).'.json');
                if (is_file($oldJsonPath)) {
                    @unlink($oldJsonPath);
                }
            }

            $compiledStyle = $themeSlug.'.png';

            $settings->update([
                'ticker_style' => $compiledStyle,
                'ticker_use_image_style' => true,
                'custom_label_left' => $customLabelLeft,
                'custom_label_width' => $customLabelWidth,
                'custom_viewport_left' => $customViewportLeft,
                'custom_viewport_right' => $customViewportRight,
            ]);

            imagedestroy($leftImg);
            imagedestroy($middleImg);
            imagedestroy($rightImg);
            imagedestroy($stitchedImg);

            Inertia::flash('toast', [
                'type' => 'success',
                'message' => "Theme {$themeName} created.",
            ]);

            return redirect()->route('ticker.themes.index');
        } catch (\Throwable $exception) {
            report($exception);

            return back()->withErrors([
                'stitch' => 'The theme could not be created.',
            ]);
        }
    }
}
