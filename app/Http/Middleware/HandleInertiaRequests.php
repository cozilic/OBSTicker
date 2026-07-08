<?php

namespace App\Http\Middleware;

use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        $officialCatalogUrl = config('ticker.themes.official_catalog_url', 'https://ticker.norrnet.online/themes');
        $officialCatalogHost = parse_url($officialCatalogUrl, PHP_URL_HOST);

        return [
            ...parent::share($request),
            'name' => config('app.name'),
            'auth' => [
                'user' => $request->user(),
            ],
            'features' => [
                'themeCatalogEnabled' => config('ticker.themes.catalog_enabled', true),
                'themeLandingLinkEnabled' => config('ticker.themes.landing_link_enabled', false),
                'themeOfficialCatalogLinkEnabled' => $officialCatalogHost !== null
                    && $request->getHost() !== $officialCatalogHost,
            ],
            'themeCatalogUrl' => $officialCatalogUrl,
            'sidebarOpen' => ! $request->hasCookie('sidebar_state') || $request->cookie('sidebar_state') === 'true',
        ];
    }
}
