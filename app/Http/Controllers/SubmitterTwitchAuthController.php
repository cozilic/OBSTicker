<?php

namespace App\Http\Controllers;

use App\Models\SubmissionAccount;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class SubmitterTwitchAuthController extends Controller
{
    public function redirect(Request $request): RedirectResponse
    {
        $returnTo = $this->validatedReturnTo($request->string('return_to')->toString());

        session()->put('ticker.submitter.return_to', $returnTo);

        $state = Str::random(40);
        session()->put('ticker.submitter.state', $state);

        $query = http_build_query([
            'client_id' => $this->clientId(),
            'redirect_uri' => $this->redirectUri(),
            'response_type' => 'code',
            'state' => $state,
        ]);

        return redirect()->away('https://id.twitch.tv/oauth2/authorize?'.$query);
    }

    public function callback(Request $request): RedirectResponse
    {
        if ($request->filled('error')) {
            return redirect()->to($this->intendedUrl())
                ->with('status', 'Twitch sign-in was canceled.');
        }

        abort_unless($request->filled('code'), 400);

        $state = $request->string('state')->toString();
        abort_unless($state !== '' && hash_equals((string) session()->pull('ticker.submitter.state'), $state), 419);

        $tokenResponse = Http::asForm()->post('https://id.twitch.tv/oauth2/token', [
            'client_id' => $this->clientId(),
            'client_secret' => $this->clientSecret(),
            'code' => $request->string('code')->toString(),
            'grant_type' => 'authorization_code',
            'redirect_uri' => $this->redirectUri(),
        ]);

        abort_unless($tokenResponse->successful(), 502, 'Unable to authenticate with Twitch.');

        $accessToken = $tokenResponse->json('access_token');

        abort_unless(is_string($accessToken) && $accessToken !== '', 502, 'Unable to authenticate with Twitch.');

        $userResponse = Http::withHeaders([
            'Client-Id' => $this->clientId(),
            'Authorization' => 'Bearer '.$accessToken,
        ])->get('https://api.twitch.tv/helix/users');

        abort_unless($userResponse->successful(), 502, 'Unable to authenticate with Twitch.');

        $twitchUser = $userResponse->json('data.0');

        abort_unless(is_array($twitchUser), 502, 'Unable to authenticate with Twitch.');

        $submitter = SubmissionAccount::query()->updateOrCreate(
            ['twitch_id' => (string) $twitchUser['id']],
            [
                'twitch_login' => (string) $twitchUser['login'],
                'display_name' => (string) $twitchUser['display_name'],
                'avatar_url' => $twitchUser['profile_image_url'] ?? null,
            ],
        );

        Auth::guard('submitter')->login($submitter);

        return redirect()->to($this->intendedUrl());
    }

    private function clientId(): string
    {
        return (string) config('services.twitch.client_id');
    }

    private function clientSecret(): string
    {
        return (string) config('services.twitch.client_secret');
    }

    private function redirectUri(): string
    {
        $redirect = (string) config('services.twitch.redirect');

        return $redirect !== '' ? $redirect : route('ticker.submitter.twitch.callback');
    }

    private function intendedUrl(): string
    {
        return (string) session()->pull('ticker.submitter.return_to', route('ticker.submit'));
    }

    private function validatedReturnTo(string $returnTo): string
    {
        if ($returnTo === '') {
            return route('ticker.submit');
        }

        if (! filter_var($returnTo, FILTER_VALIDATE_URL)) {
            return route('ticker.submit');
        }

        $appUrl = parse_url(url('/'));
        $targetUrl = parse_url($returnTo);

        if (! is_array($appUrl) || ! is_array($targetUrl)) {
            return route('ticker.submit');
        }

        $sameScheme = ($appUrl['scheme'] ?? null) === ($targetUrl['scheme'] ?? null);
        $sameHost = ($appUrl['host'] ?? null) === ($targetUrl['host'] ?? null);
        $samePort = ($appUrl['port'] ?? null) === ($targetUrl['port'] ?? null);

        return $sameScheme && $sameHost && $samePort ? $returnTo : route('ticker.submit');
    }
}
