<?php

namespace App\Providers;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->forceHttpsForAssetUrls();

        $this->configureDefaults();
    }

    /**
     * Force the URL generator to use HTTPS whenever the app is in production
     * OR APP_URL itself points at an https deployment (e.g. a production
     * server whose APP_ENV isn't named "production" but whose APP_URL clearly
     * uses https). Without this, every URL helper (url(), route(), asset(),
     * Vite's @vite directive, signed URLs, etc.) would otherwise follow the
     * scheme baked into APP_URL — which triggers mixed-content blocks in
     * browsers when APP_URL is accidentally misconfigured to http on a
     * public site served over HTTPS.
     */
    protected function forceHttpsForAssetUrls(): void
    {
        if ($this->app->isProduction() || str_starts_with((string) config('app.url'), 'https://')) {
            URL::forceScheme('https');
        }
    }

    /**
     * Configure default behaviors for production-ready applications.
     */
    protected function configureDefaults(): void
    {
        Date::use(CarbonImmutable::class);

        DB::prohibitDestructiveCommands(
            app()->isProduction(),
        );

        Password::defaults(fn (): ?Password => app()->isProduction()
            ? Password::min(12)
                ->mixedCase()
                ->letters()
                ->numbers()
                ->symbols()
                ->uncompromised()
            : null,
        );
    }
}
