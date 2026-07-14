<?php

namespace App\Http\Controllers;

use App\Http\Requests\ModerateThemeSubmissionRequest;
use App\Http\Requests\StoreThemeSubmissionRequest;
use App\Models\PublishedTheme;
use App\Models\ThemeSubmission;
use App\Models\User;
use App\Services\TickerStyleRepository;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class ThemeSubmissionController extends Controller
{
    public function create(): Response
    {
        $this->assertOfficialCatalogHost();

        return Inertia::render('themes/submit', [
            'submitUrl' => '/themes/submissions',
            'officialCatalogUrl' => config('ticker.themes.official_catalog_url', 'https://ticker.norrnet.online/themes'),
        ]);
    }

    public function store(StoreThemeSubmissionRequest $request, TickerStyleRepository $tickerStyles): RedirectResponse|JsonResponse
    {
        $this->assertOfficialCatalogHost();

        $validated = $request->validated();

        $themeName = trim($validated['theme_name']);
        $authorName = trim($validated['author_name']);
        $themeSlug = Str::slug($themeName);

        if ($themeSlug === '') {
            return $this->themeSubmissionError($request, 'theme_name', 'The theme name must contain at least one letter or number.');
        }

        if ($tickerStyles->existsTheme($themeSlug)) {
            return $this->themeSubmissionError($request, 'theme_name', 'That theme already exists in the official catalog.');
        }

        if (ThemeSubmission::query()
            ->where('theme_slug', $themeSlug)
            ->where('status', 'pending')
            ->exists()) {
            return $this->themeSubmissionError($request, 'theme_name', 'A submission with that theme name is already pending.');
        }

        try {
            $archivePath = $this->storeArchive($request, $themeSlug);
        } catch (\RuntimeException $exception) {
            $errorKey = ! empty($validated['theme_url']) ? 'theme_url' : 'theme_zip';

            return $this->themeSubmissionError($request, $errorKey, $exception->getMessage());
        }

        ThemeSubmission::query()->create([
            'theme_name' => $themeName,
            'theme_slug' => $themeSlug,
            'author_name' => $authorName,
            'submitter_name' => trim($validated['submitter_name'] ?? '') ?: null,
            'submitter_email' => trim($validated['submitter_email'] ?? '') ?: null,
            'source_type' => ! empty($validated['theme_url']) ? 'url' : 'upload',
            'source_url' => trim($validated['theme_url'] ?? '') ?: null,
            'archive_path' => $archivePath,
            'status' => 'pending',
            'notes' => trim($validated['notes'] ?? '') ?: null,
        ]);

        if ($request->expectsJson()) {
            return response()->json([
                'status' => 'queued',
                'theme_slug' => $themeSlug,
            ], 201);
        }

        return redirect()->route('themes.submitted');
    }

    public function storeFromTheme(string $theme, TickerStyleRepository $tickerStyles): RedirectResponse
    {
        $slug = Str::slug($theme);
        if ($slug === '' || ! $tickerStyles->existsTheme($slug)) {
            return back()->withErrors([
                'submission' => 'The selected theme could not be found.',
            ]);
        }

        $themeData = $tickerStyles->findDetailed($slug);
        if ($themeData === null) {
            return back()->withErrors([
                'submission' => 'The selected theme could not be found.',
            ]);
        }

        $existingSubmission = ThemeSubmission::query()
            ->where('theme_slug', $slug)
            ->first();

        if ($existingSubmission?->status === 'pending') {
            return back()->withErrors([
                'submission' => 'A submission for this theme is already pending.',
            ]);
        }

        if ($existingSubmission?->status === 'approved') {
            return back()->withErrors([
                'submission' => 'This theme is already in the official catalog.',
            ]);
        }

        $submissionResult = $this->isOfficialCatalogHost();
        $storedArchivePath = null;
        $user = Auth::user();
        $submitterName = $this->userName($user);
        $submitterEmail = $this->userEmail($user);

        try {
            $archivePath = $tickerStyles->createThemeZip($slug);
            $storedArchivePath = $this->storeThemeArchive($archivePath, $slug);

            if (! $submissionResult) {
                $submissionResult = $this->submitArchiveToOfficialCatalog(
                    $archivePath,
                    $themeData['label'],
                    $themeData['author'] ?? $submitterName,
                );
            }
        } catch (\Throwable $exception) {
            report($exception);

            if (is_string($storedArchivePath)) {
                Storage::disk('local')->delete($storedArchivePath);
            }

            return back()->withErrors([
                'submission' => 'The theme could not be submitted.',
            ]);
        } finally {
            if (isset($archivePath) && is_file($archivePath)) {
                File::delete($archivePath);
            }
        }

        if ($submissionResult === false) {
            Storage::disk('local')->delete($storedArchivePath);

            return back()->withErrors([
                'submission' => 'The theme could not be submitted to the official catalog.',
            ]);
        }

        ThemeSubmission::query()->updateOrCreate(
            ['theme_slug' => $slug],
            [
                'theme_name' => $themeData['label'],
                'author_name' => $themeData['author'] ?? $submitterName,
                'submitter_name' => trim($submitterName) ?: null,
                'submitter_email' => trim($submitterEmail) ?: null,
                'source_type' => 'local',
                'source_url' => null,
                'archive_path' => $storedArchivePath,
                'status' => 'pending',
                'notes' => null,
                'reviewed_by_id' => null,
                'reviewed_at' => null,
                'published_at' => null,
                'rejection_reason' => null,
                'published_theme_slug' => null,
            ],
        );

        if ($existingSubmission !== null && $existingSubmission->archive_path !== $storedArchivePath) {
            Storage::disk('local')->delete($existingSubmission->archive_path);
        }

        Inertia::flash('toast', [
            'type' => 'success',
            'message' => 'Theme submitted to the official queue.',
        ]);

        return back();
    }

    public function status(string $theme): JsonResponse
    {
        $this->assertOfficialCatalogHost();

        $slug = Str::slug($theme);
        if ($slug === '') {
            abort(404);
        }

        $submission = ThemeSubmission::query()->where('theme_slug', $slug)->latest()->first();
        if ($submission === null) {
            return response()->json([
                'status' => null,
                'rejection_reason' => null,
            ]);
        }

        return response()->json([
            'status' => $submission->status,
            'rejection_reason' => $submission->rejection_reason,
        ]);
    }

    public function submitted(): Response
    {
        $this->assertOfficialCatalogHost();

        return Inertia::render('themes/submitted', [
            'officialCatalogUrl' => config('ticker.themes.official_catalog_url', 'https://ticker.norrnet.online/themes'),
        ]);
    }

    public function index(): Response
    {
        $this->assertOfficialCatalogHost();
        $this->authorizeModeration();

        $paginator = ThemeSubmission::query()
            ->with('reviewer:id,name')
            ->latest()
            ->paginate(10);

        $submissions = [
            'data' => $paginator->getCollection()
                ->map(
                    fn (ThemeSubmission $submission): array => [
                        'id' => $submission->id,
                        'theme_name' => $submission->theme_name,
                        'theme_slug' => $submission->theme_slug,
                        'author_name' => $submission->author_name,
                        'submitter_name' => $submission->submitter_name,
                        'submitter_email' => $submission->submitter_email,
                        'source_type' => $submission->source_type,
                        'source_url' => $submission->source_url,
                        'status' => $submission->status,
                        'notes' => $submission->notes,
                        'rejection_reason' => $submission->rejection_reason,
                        'reviewed_at' => $submission->reviewed_at?->toDateTimeString(),
                        'published_at' => $submission->published_at?->toDateTimeString(),
                        'reviewer_name' => $submission->reviewer?->name,
                        'created_at' => $submission->created_at?->toDateTimeString(),
                    ],
                )
                ->all(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'from' => $paginator->firstItem(),
                'last_page' => $paginator->lastPage(),
                'path' => $paginator->path(),
                'per_page' => $paginator->perPage(),
                'to' => $paginator->lastItem(),
                'total' => $paginator->total(),
                'first_page_url' => $paginator->url(1),
                'last_page_url' => $paginator->url($paginator->lastPage()),
                'next_page_url' => $paginator->nextPageUrl(),
                'prev_page_url' => $paginator->previousPageUrl(),
            ],
        ];

        return Inertia::render('ticker/theme-submissions', [
            'submissions' => $submissions,
            'officialCatalogUrl' => config('ticker.themes.official_catalog_url', 'https://ticker.norrnet.online/themes'),
        ]);
    }

    public function approve(
        ModerateThemeSubmissionRequest $request,
        ThemeSubmission $themeSubmission,
        TickerStyleRepository $tickerStyles,
    ): RedirectResponse {
        $this->assertOfficialCatalogHost();
        $this->authorizeModeration();

        if ($themeSubmission->status !== 'pending') {
            return back()->withErrors([
                'submission' => 'This submission has already been reviewed.',
            ]);
        }

        // Awake the theme: run the archive through the catalog importer (writes
        // the theme assets that OBS' browser source reads) and snapshot the
        // metadata into the published_themes table. Submissions stay invisible
        // until this step succeeds — see published_themes migration.
        $archiveAbsolutePath = Storage::disk('local')->path($themeSubmission->archive_path);
        if (! is_file($archiveAbsolutePath)) {
            return back()->withErrors([
                'submission' => 'The stored archive is missing.',
            ]);
        }

        $userId = Auth::id();
        $cleanupSlug = $themeSubmission->theme_slug;

        // Fail fast if a previously-approved theme already owns this slug. The
        // importer would otherwise overwrite the published assets and the
        // unique constraint on `published_themes.theme_slug` would surface as
        // a generic "could not be approved" reply.
        if (PublishedTheme::query()->where('theme_slug', $cleanupSlug)->exists()) {
            return back()->withErrors([
                'submission' => 'A public theme with that slug already exists.',
            ]);
        }

        try {
            $publishedTheme = DB::transaction(function () use (
                $themeSubmission,
                $tickerStyles,
                $archiveAbsolutePath,
                $userId,
                &$cleanupSlug,
            ): PublishedTheme {
                // Importer wipes any stale assets for the same slug, so a stale
                // filesystem entry from a previous import can't survive.
                $imported = $tickerStyles->importThemeZip(
                    new UploadedFile(
                        $archiveAbsolutePath,
                        basename($archiveAbsolutePath),
                        'application/zip',
                        null,
                        true,
                    ),
                );

                // Update the cleanup target by reference so a DB failure after
                // a successful import can still scrub the new assets.
                $cleanupSlug = $imported['slug'];

                $publishedTheme = PublishedTheme::query()->create([
                    'theme_slug' => $imported['slug'],
                    'theme_name' => $imported['slug'],
                    'theme_label' => $imported['label'],
                    'author_name' => $imported['author'],
                    'original_submission_id' => $themeSubmission->id,
                    'approved_by_id' => $userId,
                    'approved_at' => now(),
                ]);

                $themeSubmission->update([
                    'status' => 'approved',
                    'reviewed_by_id' => $userId,
                    'reviewed_at' => now(),
                    'published_at' => now(),
                    'published_theme_slug' => $imported['slug'],
                    'published_theme_id' => $publishedTheme->id,
                ]);

                return $publishedTheme;
            });
        } catch (\Throwable $exception) {
            report($exception);

            // Best-effort scrub of any half-written filesystem state so a failed
            // approval doesn't leave the catalog pointing at stale assets.
            try {
                $tickerStyles->deleteTheme($cleanupSlug);
            } catch (\Throwable) {
                // ignore — the next successful approve will overwrite it.
            }

            return back()->withErrors([
                'submission' => 'The submission could not be approved.',
            ]);
        }

        Storage::disk('local')->delete($themeSubmission->archive_path);

        Inertia::flash('toast', [
            'type' => 'success',
            'message' => 'Theme approved.',
        ]);

        return back();
    }

    public function reject(
        ModerateThemeSubmissionRequest $request,
        ThemeSubmission $themeSubmission,
    ): RedirectResponse {
        $this->assertOfficialCatalogHost();
        $this->authorizeModeration();

        if ($themeSubmission->status !== 'pending') {
            return back()->withErrors([
                'submission' => 'This submission has already been reviewed.',
            ]);
        }

        $validated = $request->validated();

        $themeSubmission->update([
            'status' => 'rejected',
            'reviewed_by_id' => Auth::id(),
            'reviewed_at' => now(),
            'rejection_reason' => $validated['rejection_reason'] ?? null,
        ]);

        // Submissions stay invisible until they're approved, so there's no
        // catalog entry to clean up here.
        Storage::disk('local')->delete($themeSubmission->archive_path);

        Inertia::flash('toast', [
            'type' => 'success',
            'message' => 'Theme submission rejected.',
        ]);

        return back();
    }

    public function destroy(
        ModerateThemeSubmissionRequest $request,
        ThemeSubmission $themeSubmission,
    ): RedirectResponse {
        $this->assertOfficialCatalogHost();
        $this->authorizeModeration();

        if ($themeSubmission->status === 'approved') {
            return back()->withErrors([
                'submission' => 'Approved submissions cannot be deleted from the queue.',
            ]);
        }

        // Pending submissions never reach the catalog, so we just delete the
        // cached archive and the row.
        Storage::disk('local')->delete($themeSubmission->archive_path);
        $themeSubmission->delete();

        Inertia::flash('toast', [
            'type' => 'success',
            'message' => 'Theme submission deleted.',
        ]);

        return back();
    }

    private function authorizeModeration(): void
    {
        $user = Auth::user();
        abort_unless($user instanceof User && $user->isPlatformOwner(), 403);
    }

    private function assertOfficialCatalogHost(): void
    {
        if (! $this->isOfficialCatalogHost()) {
            abort(404);
        }
    }

    private function isOfficialCatalogHost(): bool
    {
        $officialCatalogHost = parse_url(
            config('ticker.themes.official_catalog_url', 'https://ticker.norrnet.online/themes'),
            PHP_URL_HOST,
        );

        return $officialCatalogHost !== null && request()->getHost() === $officialCatalogHost;
    }

    private function storeArchive(StoreThemeSubmissionRequest $request, string $themeSlug): string
    {
        $validated = $request->validated();
        $directory = 'theme-submissions';
        Storage::disk('local')->makeDirectory($directory);

        $filename = $themeSlug.'-'.Str::uuid()->toString().'.zip';

        if (! empty($validated['theme_url'])) {
            $url = $validated['theme_url'];
            $storedPath = $directory.'/'.$filename;

            // Bypass HTTP completely when the URL points at a share file on this
            // same host. This avoids server-to-self connectivity issues that can
            // trigger cURL timeouts when re-downloading the file we just wrote.
            $localSharePath = $this->resolveLocalSharePath($url);
            if ($localSharePath !== null) {
                Storage::disk('local')->put($storedPath, File::get($localSharePath));

                return $storedPath;
            }

            // Stream the download straight to disk with a generous timeout and
            // a connection-only timeout so we fail fast on DNS / TLS handshakes
            // that hang. Retries cover transient network blips.
            $absolutePath = Storage::disk('local')->path($storedPath);

            try {
                $response = Http::connectTimeout(10)
                    ->timeout(120)
                    ->retry(3, 2000)
                    ->sink($absolutePath)
                    ->get($url);
            } catch (\Throwable $exception) {
                @unlink($absolutePath);

                throw new \RuntimeException('The theme URL could not be downloaded (network error or timeout).');
            }

            if (! $response->successful()) {
                @unlink($absolutePath);

                throw new \RuntimeException('The theme URL could not be downloaded (HTTP '.$response->status().').');
            }

            return $storedPath;
        }

        $uploaded = $request->file('theme_zip');
        if (! $uploaded instanceof UploadedFile) {
            throw new \RuntimeException('A theme archive is required.');
        }

        Storage::disk('local')->putFileAs($directory, $uploaded, $filename);

        return $directory.'/'.$filename;
    }

    /**
     * Decide whether the theme URL points at a share file we can read directly
     * from disk (avoids a server-to-self HTTP roundtrip). Returns the absolute
     * storage path when the file is on the same host and matches the public
     * share endpoint; throws a RuntimeException for any other same-host URL;
     * returns null when the URL is on a different host so the caller can fall
     * back to an HTTP download.
     */
    private function resolveLocalSharePath(string $url): ?string
    {
        $expectedHost = $this->resolveExpectedHost();
        if ($expectedHost === '') {
            return null;
        }

        $urlHost = parse_url($url, PHP_URL_HOST);
        if (! is_string($urlHost)) {
            return null;
        }

        if (strcasecmp($urlHost, $expectedHost) !== 0) {
            // Different host – let the caller download over HTTP.
            return null;
        }

        // Same host – only allow direct reads of public share files, to avoid
        // the server being coaxed into fetching its own private URLs.
        $urlPath = parse_url($url, PHP_URL_PATH);
        if (! is_string($urlPath) || preg_match(
            '#^/themeshare/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$#',
            $urlPath,
            $matches,
        ) !== 1) {
            throw new \RuntimeException('Only public share URLs from this host are allowed.');
        }

        $localPath = storage_path('app/private/theme-shares/'.$matches[1].'.zip');
        if (! is_file($localPath)) {
            throw new \RuntimeException('The share file is no longer available.');
        }

        return $localPath;
    }

    private function resolveExpectedHost(): string
    {
        $host = request()->getHost();
        if ($host !== '') {
            return $host;
        }

        $appUrlHost = parse_url((string) config('app.url'), PHP_URL_HOST);

        return is_string($appUrlHost) ? $appUrlHost : '';
    }

    private function storeThemeArchive(string $archivePath, string $themeSlug): string
    {
        $directory = 'theme-submissions';
        Storage::disk('local')->makeDirectory($directory);

        $filename = $themeSlug.'-'.Str::uuid()->toString().'.zip';
        $storedPath = $directory.'/'.$filename;

        Storage::disk('local')->put($storedPath, File::get($archivePath));

        return $storedPath;
    }

    private function submitArchiveToOfficialCatalog(string $archivePath, string $themeName, string $authorName): bool
    {
        $officialCatalogUrl = rtrim(
            config('ticker.themes.official_catalog_url', 'https://ticker.norrnet.online/themes'),
            '/',
        );
        $submissionUrl = $officialCatalogUrl.'/submissions';

        $response = Http::timeout(30)
            ->acceptJson()
            ->attach('theme_zip', File::get($archivePath), basename($archivePath))
            ->post($submissionUrl, [
                'theme_name' => $themeName,
                'author_name' => $authorName,
                'submitter_name' => $this->userName(Auth::user()),
                'submitter_email' => $this->userEmail(Auth::user()),
            ]);

        return $response->successful();
    }

    private function userName(mixed $user): string
    {
        $name = data_get($user, 'name');

        return is_string($name) && $name !== '' ? $name : 'Unknown';
    }

    private function userEmail(mixed $user): string
    {
        $email = data_get($user, 'email');

        return is_string($email) ? $email : '';
    }

    private function themeSubmissionError(
        StoreThemeSubmissionRequest $request,
        string $field,
        string $message,
    ): RedirectResponse|JsonResponse {
        if ($request->expectsJson()) {
            return response()->json([
                'message' => $message,
                'errors' => [
                    $field => [$message],
                ],
            ], 422);
        }

        return back()->withErrors([
            $field => $message,
        ]);
    }
}
