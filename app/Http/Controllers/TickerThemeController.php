<?php

namespace App\Http\Controllers;

use App\Models\TickerSetting;
use App\Services\TickerStyleRepository;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response as HttpResponse;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class TickerThemeController extends Controller
{
    public function index(TickerStyleRepository $tickerStyles): Response|RedirectResponse
    {
        $this->assertThemeCatalogEnabled();

        if (request()->routeIs('themes.*')) {
            return Inertia::render('themes/index', [
                'themes' => $tickerStyles->paginateDetailed(10),
            ]);
        }

        return Inertia::render('ticker/themes', [
            'themes' => $tickerStyles->paginateDetailed(10),
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

        return Inertia::render('ticker/theme-preview', [
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
}
