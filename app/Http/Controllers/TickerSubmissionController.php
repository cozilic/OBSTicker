<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreTickerSubmissionRequest;
use App\Models\TickerMessage;
use App\Models\TickerSetting;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

class TickerSubmissionController extends Controller
{
    public function create(Request $request): Response
    {
        $owner = $this->ownerFromRequest($request);
        $submitter = Auth::guard('submitter')->user();
        $settings = $owner !== null ? TickerSetting::current($owner) : null;
        $requiresModerator = $settings instanceof TickerSetting && $settings->moderator_only_submissions;
        $moderator = $owner !== null ? $this->workspaceUser($request, $owner) : null;
        $isModeratorAuthenticated = $moderator !== null;
        $requiresTwitchAuth = ! $requiresModerator && $settings instanceof TickerSetting && $settings->require_auth_to_submit;

        return Inertia::render('ticker/submit', [
            'tickerName' => $owner?->name,
            'submissionUrl' => $this->submissionUrl($owner),
            'loginUrl' => route('login'),
            'connectUrl' => route('ticker.submitter.twitch.redirect', [
                'return_to' => $this->submissionPageUrl($owner),
            ]),
            'requiresTwitchAuth' => $requiresTwitchAuth,
            'requiresModerator' => $requiresModerator,
            'isModeratorAuthenticated' => $isModeratorAuthenticated,
            'isTwitchAuthenticated' => $submitter !== null,
            'submitterName' => $moderator instanceof User ? $moderator->name : $submitter?->display_name,
        ]);
    }

    public function store(StoreTickerSubmissionRequest $request): RedirectResponse
    {
        $owner = $this->ownerFromRequest($request);

        abort_if(! $owner, 404);

        $submitter = Auth::guard('submitter')->user();
        $settings = TickerSetting::current($owner);
        $moderator = $this->workspaceUser($request, $owner);

        if ($settings->moderator_only_submissions && $moderator === null) {
            return redirect()->route('login');
        }

        if ($settings->require_auth_to_submit && $submitter === null) {
            return redirect()->route('ticker.submitter.twitch.redirect', [
                'return_to' => $this->submissionPageUrl($owner),
            ]);
        }

        $data = $request->validated();

        TickerMessage::query()->create([
            ...$data,
            'owner_id' => $owner->id,
            'source_type' => 'user',
            'source_label' => $moderator instanceof User ? $moderator->name : ($submitter?->display_name ?: ($data['submitter_name'] ?: 'Publik')),
            'status' => 'queued',
            'is_active' => true,
            'sort_order' => 0,
        ]);

        return back()->with('status', 'Texten ligger i kön.');
    }

    private function ownerFromRequest(Request $request): ?User
    {
        $uuid = $request->string('uuid')->toString();

        if ($uuid !== '') {
            return User::query()->where('ticker_uuid', $uuid)->first();
        }

        return User::query()->where('role', 'owner')->oldest()->first();
    }

    private function workspaceUser(Request $request, User $owner): ?User
    {
        $user = $request->user('web');

        if (! $user instanceof User || $user->ownerAccountId() !== $owner->id) {
            return null;
        }

        return $user;
    }

    private function submissionUrl(?User $owner): string
    {
        return $owner?->ticker_uuid
            ? route('ticker.submissions.store', ['uuid' => $owner->ticker_uuid])
            : route('ticker.submissions.store');
    }

    private function submissionPageUrl(?User $owner): string
    {
        return $owner?->ticker_uuid
            ? route('ticker.submit', ['uuid' => $owner->ticker_uuid])
            : route('ticker.submit');
    }
}
