<?php

namespace App\Http\Controllers;

use App\Http\Requests\ModerateThemeSubmissionRequest;
use App\Http\Requests\StoreThemeSubmissionRequest;
use App\Models\ThemeSubmission;
use App\Models\User;
use App\Services\TickerStyleRepository;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
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

    public function store(StoreThemeSubmissionRequest $request, TickerStyleRepository $tickerStyles): RedirectResponse
    {
        $this->assertOfficialCatalogHost();

        $validated = $request->validated();

        $themeName = trim($validated['theme_name']);
        $authorName = trim($validated['author_name']);
        $themeSlug = Str::slug($themeName);

        if ($themeSlug === '') {
            return back()->withErrors([
                'theme_name' => 'The theme name must contain at least one letter or number.',
            ]);
        }

        if ($tickerStyles->existsTheme($themeSlug)) {
            return back()->withErrors([
                'theme_name' => 'That theme already exists in the official catalog.',
            ]);
        }

        if (ThemeSubmission::query()
            ->where('theme_slug', $themeSlug)
            ->where('status', 'pending')
            ->exists()) {
            return back()->withErrors([
                'theme_name' => 'A submission with that theme name is already pending.',
            ]);
        }

        try {
            $archivePath = $this->storeArchive($request, $themeSlug);
        } catch (\RuntimeException $exception) {
            $errorKey = ! empty($validated['theme_url']) ? 'theme_url' : 'theme_zip';

            return back()->withErrors([
                $errorKey => $exception->getMessage(),
            ]);
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

        return redirect()->route('themes.submitted');
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

        if ($tickerStyles->existsTheme($themeSubmission->theme_slug)) {
            return back()->withErrors([
                'submission' => 'That theme already exists in the official catalog.',
            ]);
        }

        $archiveAbsolutePath = Storage::disk('local')->path($themeSubmission->archive_path);
        if (! is_file($archiveAbsolutePath)) {
            return back()->withErrors([
                'submission' => 'The stored archive is missing.',
            ]);
        }

        try {
            $theme = $tickerStyles->importThemeZip(
                new UploadedFile(
                    $archiveAbsolutePath,
                    basename($archiveAbsolutePath),
                    'application/zip',
                    null,
                    true,
                ),
            );
        } catch (\Throwable $exception) {
            report($exception);

            return back()->withErrors([
                'submission' => 'The submission could not be approved.',
            ]);
        }

        $themeSubmission->update([
            'status' => 'approved',
            'reviewed_by_id' => Auth::id(),
            'reviewed_at' => now(),
            'published_at' => now(),
            'published_theme_slug' => $theme['slug'],
        ]);

        Storage::disk('local')->delete($themeSubmission->archive_path);

        Inertia::flash('toast', [
            'type' => 'success',
            'message' => 'Theme approved and published.',
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
        $officialCatalogHost = parse_url(
            config('ticker.themes.official_catalog_url', 'https://ticker.norrnet.online/themes'),
            PHP_URL_HOST,
        );

        if ($officialCatalogHost === null || request()->getHost() !== $officialCatalogHost) {
            abort(404);
        }
    }

    private function storeArchive(StoreThemeSubmissionRequest $request, string $themeSlug): string
    {
        $validated = $request->validated();
        $directory = 'theme-submissions';
        Storage::disk('local')->makeDirectory($directory);

        $filename = $themeSlug.'-'.Str::uuid()->toString().'.zip';

        if (! empty($validated['theme_url'])) {
            $response = Http::timeout(15)->get($validated['theme_url']);
            if (! $response->successful()) {
                throw new \RuntimeException('The theme URL could not be downloaded.');
            }

            Storage::disk('local')->put($directory.'/'.$filename, $response->body());

            return $directory.'/'.$filename;
        }

        $uploaded = $request->file('theme_zip');
        if (! $uploaded instanceof UploadedFile) {
            throw new \RuntimeException('A theme archive is required.');
        }

        Storage::disk('local')->putFileAs($directory, $uploaded, $filename);

        return $directory.'/'.$filename;
    }
}
