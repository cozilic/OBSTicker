<?php

namespace App\Http\Controllers;

use App\Models\ThemeSubmission;
use App\Models\TickerSetting;
use App\Services\TickerStyleRepository;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response as HttpResponse;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class TickerThemeController extends Controller
{
    public function index(TickerStyleRepository $tickerStyles): Response|RedirectResponse
    {
        $this->assertThemeCatalogEnabled();
        $themes = $tickerStyles->paginateDetailed(10);

        if (request()->routeIs('themes.*')) {
            $allThemes = $this->attachSubmissionState(
                $this->paginateThemeItems($tickerStyles->allDetailed()),
            );

            $themes = $this->paginateThemeItems(
                $this->filterApprovedThemes($allThemes['data']),
                10,
            );

            return Inertia::render('themes/index', [
                'themes' => $themes,
            ]);
        }

        $themes = $this->attachSubmissionState($themes);

        return Inertia::render('ticker/themes', [
            'themes' => $themes,
            'createThemeUrl' => route('ticker.theme'),
        ]);
    }

    public function share(string $theme, TickerStyleRepository $tickerStyles): Response|RedirectResponse
    {
        $this->assertThemeCatalogEnabled();

        $slug = Str::slug($theme);
        if ($slug === '' || ! $tickerStyles->existsTheme($slug)) {
            abort(404);
        }

        return Inertia::render('ticker/theme-share', [
            'theme' => $tickerStyles->findDetailed($slug),
            'shareUrl' => request()->string('share_url')->toString() ?: $tickerStyles->shareZipUrl($slug),
            'generateShareUrlAction' => route('ticker.themes.share.url', ['theme' => $slug]),
        ]);
    }

    public function download(string $theme, TickerStyleRepository $tickerStyles): BinaryFileResponse|HttpResponse
    {
        $this->assertThemeCatalogEnabled();

        $slug = Str::slug($theme);
        if ($slug === '' || ! $tickerStyles->existsTheme($slug)) {
            abort(404);
        }

        $archivePath = $tickerStyles->createThemeZip($slug);

        return response()
            ->download($archivePath, $slug.'.zip', ['Content-Type' => 'application/zip'])
            ->deleteFileAfterSend(true);
    }

    public function generateShareUrl(string $theme, TickerStyleRepository $tickerStyles): RedirectResponse|JsonResponse
    {
        $this->assertThemeCatalogEnabled();

        $slug = Str::slug($theme);
        if ($slug === '' || ! $tickerStyles->existsTheme($slug)) {
            abort(404);
        }

        $sharePath = $tickerStyles->createShareZip($slug);
        $shareUrl = $tickerStyles->shareZipUrl($slug);

        if (request()->expectsJson()) {
            return response()->json([
                'share_url' => $shareUrl,
                'share_path' => $sharePath,
            ]);
        }

        return redirect()->route('ticker.themes.share', [
            'theme' => $slug,
            'share_url' => $shareUrl,
        ]);
    }

    public function show(string $theme, TickerStyleRepository $tickerStyles): Response|RedirectResponse
    {
        $this->assertThemeCatalogEnabled();

        $themeData = $tickerStyles->findDetailed($theme);
        if ($themeData === null) {
            abort(404);
        }

        if (request()->routeIs('themes.*') && ! $this->isApprovedOfficialTheme($themeData['slug'])) {
            abort(404);
        }

        return Inertia::render(request()->routeIs('themes.*') ? 'themes/theme-preview' : 'ticker/theme-preview', [
            'theme' => $themeData,
            'themesUrl' => request()->routeIs('themes.*')
                ? route('themes.index')
                : route('ticker.themes.index'),
            'createThemeUrl' => route('ticker.theme'),
        ]);
    }

    public function store(Request $request, TickerStyleRepository $tickerStyles): RedirectResponse
    {
        $this->assertThemeCatalogEnabled();

        $validated = $request->validate([
            'theme_zip' => ['nullable', 'file', 'mimes:zip', 'max:10240', 'required_without:theme_url'],
            'theme_url' => ['nullable', 'url', 'max:2048', 'required_without:theme_zip'],
        ]);

        try {
            if (! empty($validated['theme_url'])) {
                $theme = $tickerStyles->importThemeUrl($validated['theme_url']);
            } else {
                $theme = $tickerStyles->importThemeZip($validated['theme_zip']);
            }
        } catch (\RuntimeException $exception) {
            $errorKey = ! empty($validated['theme_url']) ? 'theme_url' : 'theme_zip';

            return back()->withErrors([
                $errorKey => $exception->getMessage(),
            ]);
        }

        return redirect()->route('ticker.themes.show', ['theme' => $theme['slug']]);
    }

    public function destroy(string $theme, TickerStyleRepository $tickerStyles): RedirectResponse
    {
        $this->assertThemeCatalogEnabled();

        $slug = Str::slug($theme);
        if ($slug === '') {
            return back();
        }

        $styleFilename = $slug.'.png';

        TickerSetting::query()
            ->where('ticker_style', $styleFilename)
            ->update([
                'ticker_style' => null,
                'ticker_use_image_style' => false,
                'custom_label_left' => null,
                'custom_label_width' => null,
                'custom_viewport_left' => null,
                'custom_viewport_right' => null,
            ]);

        $tickerStyles->deleteTheme($slug);

        return back();
    }

    private function assertThemeCatalogEnabled(): void
    {
        if (! config('ticker.themes.catalog_enabled', true)) {
            abort(404);
        }
    }

    /**
     * @param array{
     *     data: list<array{
     *         slug: string,
     *         value: string,
     *         label: string,
     *         url: string,
     *         author: string|null,
     *         downloadUrl?: string,
     *         submissionStatus?: string|null,
     *         submissionRejectionReason?: string|null
     *     }>,
     *     links: list<array{url: string|null, label: string, active: bool}>,
     *     meta: array{
     *         current_page: int,
     *         from: int|null,
     *         last_page: int,
     *         path: string,
     *         per_page: int,
     *         to: int|null,
     *         total: int,
     *         first_page_url: string|null,
     *         last_page_url: string|null,
     *         next_page_url: string|null,
     *         prev_page_url: string|null
     *     }
     * } $themes
     * @return array{
     *     data: list<array{
     *         slug: string,
     *         value: string,
     *         label: string,
     *         url: string,
     *         author: string|null,
     *         downloadUrl?: string,
     *         submissionStatus?: string|null,
     *         submissionRejectionReason?: string|null
     *     }>,
     *     links: list<array{url: string|null, label: string, active: bool}>,
     *     meta: array{
     *         current_page: int,
     *         from: int|null,
     *         last_page: int,
     *         path: string,
     *         per_page: int,
     *         to: int|null,
     *         total: int,
     *         first_page_url: string|null,
     *         last_page_url: string|null,
     *         next_page_url: string|null,
     *         prev_page_url: string|null
     *     }
     * }
     */
    private function attachSubmissionState(array $themes): array
    {
        $themeSlugs = $this->themeSlugs($themes['data']);
        $submissions = ThemeSubmission::query()
            ->whereIn('theme_slug', $themeSlugs)
            ->get()
            ->keyBy('theme_slug');
        $officialSubmissionStates = $this->fetchOfficialSubmissionStates($themeSlugs);

        $themes['data'] = array_map(
            static function (array $theme) use ($submissions, $officialSubmissionStates): array {
                $submission = $submissions->get($theme['slug']);
                $officialSubmission = $officialSubmissionStates[$theme['slug']] ?? null;

                return [
                    ...$theme,
                    'submissionStatus' => $officialSubmission['status'] ?? $submission?->status,
                    'submissionRejectionReason' => $officialSubmission['rejection_reason'] ?? $submission?->rejection_reason,
                ];
            },
            $themes['data'],
        );

        return $themes;
    }

    /**
     * @param list<array{
     *     slug: string,
     *     value: string,
     *     label: string,
     *     url: string,
     *     author: string|null,
     *     downloadUrl?: string,
     *     submissionStatus?: string|null,
     *     submissionRejectionReason?: string|null
     * }> $themes
     * @return list<array{
     *     slug: string,
     *     value: string,
     *     label: string,
     *     url: string,
     *     author: string|null,
     *     downloadUrl?: string,
     *     submissionStatus?: string|null,
     *     submissionRejectionReason?: string|null
     * }>
     */
    private function filterApprovedThemes(array $themes): array
    {
        return array_values(array_filter(
            $themes,
            static fn (array $theme): bool => ($theme['submissionStatus'] ?? null) === 'approved',
        ));
    }

    private function isApprovedOfficialTheme(string $slug): bool
    {
        return ThemeSubmission::query()
            ->where('theme_slug', $slug)
            ->where('status', 'approved')
            ->exists();
    }

    /**
     * @param  list<string>  $slugs
     * @return array<string, array{status: string|null, rejection_reason: string|null}>
     */
    private function fetchOfficialSubmissionStates(array $slugs): array
    {
        if ($slugs === [] || $this->isOfficialCatalogHost()) {
            return [];
        }

        $officialCatalogUrl = rtrim(
            config('ticker.themes.official_catalog_url', 'https://ticker.norrnet.online/themes'),
            '/',
        );

        $states = [];

        foreach (array_values(array_unique($slugs)) as $slug) {
            try {
                $response = Http::acceptJson()
                    ->timeout(10)
                    ->get($officialCatalogUrl.'/submissions/'.rawurlencode($slug).'/status');

                if (! $response->successful()) {
                    continue;
                }

                $payload = $response->json();
                if (! is_array($payload)) {
                    continue;
                }

                $status = $payload['status'] ?? null;
                $rejectionReason = $payload['rejection_reason'] ?? null;

                $states[$slug] = [
                    'status' => $status !== null ? (string) $status : null,
                    'rejection_reason' => $rejectionReason !== null ? (string) $rejectionReason : null,
                ];
            } catch (\Throwable $exception) {
                report($exception);
            }
        }

        return $states;
    }

    /**
     * @param  list<array{slug: string, value: string, label: string, url: string, author: string|null, downloadUrl?: string}>  $themes
     * @return list<string>
     */
    private function themeSlugs(array $themes): array
    {
        $slugs = [];

        foreach ($themes as $theme) {
            $slug = $theme['slug'];
            if ($slug !== '') {
                $slugs[] = $slug;
            }
        }

        return $slugs;
    }

    /**
     * @param list<array{
     *     slug: string,
     *     value: string,
     *     label: string,
     *     url: string,
     *     author: string|null,
     *     submissionStatus?: string|null,
     *     submissionRejectionReason?: string|null
     * }> $themes
     * @return array{
     *     data: list<array{
     *         slug: string,
     *         value: string,
     *         label: string,
     *         url: string,
     *         author: string|null,
     *         downloadUrl: string,
     *         submissionStatus?: string|null,
     *         submissionRejectionReason?: string|null
     *     }>,
     *     links: list<array{url: string|null, label: string, active: bool}>,
     *     meta: array{
     *         current_page: int,
     *         from: int|null,
     *         last_page: int,
     *         path: string,
     *         per_page: int,
     *         to: int|null,
     *         total: int,
     *         first_page_url: string|null,
     *         last_page_url: string|null,
     *         next_page_url: string|null,
     *         prev_page_url: string|null
     *     }
     * }
     */
    private function paginateThemeItems(array $themes, int $perPage = 10): array
    {
        $currentPage = max(1, LengthAwarePaginator::resolveCurrentPage());

        $themes = array_map(
            static fn (array $theme): array => [
                ...$theme,
                'downloadUrl' => route('ticker.themes.share.download', ['theme' => $theme['slug']]),
            ],
            $themes,
        );

        $paginator = new LengthAwarePaginator(
            array_slice($themes, ($currentPage - 1) * $perPage, $perPage),
            count($themes),
            $perPage,
            $currentPage,
            [
                'path' => LengthAwarePaginator::resolveCurrentPath(),
                'pageName' => 'page',
            ],
        );

        return [
            'data' => array_slice($themes, ($currentPage - 1) * $perPage, $perPage),
            'links' => [],
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
    }

    private function isOfficialCatalogHost(): bool
    {
        $officialCatalogHost = parse_url(
            config('ticker.themes.official_catalog_url', 'https://ticker.norrnet.online/themes'),
            PHP_URL_HOST,
        );

        return $officialCatalogHost !== null && request()->getHost() === $officialCatalogHost;
    }
}
