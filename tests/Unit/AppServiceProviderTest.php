<?php

use App\Providers\AppServiceProvider;
use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

uses(TestCase::class);

test('app service provider forces https urls in production', function () {
    $previousEnvironment = App::environment();

    try {
        App::detectEnvironment(fn (): string => 'production');
        URL::forceScheme(null);

        $provider = new AppServiceProvider(App::getFacadeRoot());
        $provider->boot();

        expect(url('/dashboard'))->toStartWith('https://');
    } finally {
        App::detectEnvironment(fn (): string => $previousEnvironment);
        URL::forceScheme(null);
    }
});
