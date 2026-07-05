<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdateTickerSettingRequest;
use App\Models\RssFeed;
use App\Models\TickerMessage;
use App\Models\TickerSetting;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

class TickerDashboardController extends Controller
{
    public function __invoke(): Response|RedirectResponse
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
                'label_position',
                'chroma_key_color',
                'image_url',
                'crawl_duration_seconds',
                'message_display_seconds',
                'poll_interval_seconds',
                'require_auth_to_submit',
                'show_rss',
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
            'tickerUrl' => route('ticker.show', ['uuid' => $owner->ticker_uuid]),
            'submitUrl' => route('ticker.submit', ['uuid' => $owner->ticker_uuid]),
        ]);
    }

    public function update(UpdateTickerSettingRequest $request): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();
        $owner = User::query()->findOrFail($user->ownerAccountId());

        TickerSetting::current($owner)->update([
            ...$request->validated(),
            'show_rss' => $request->boolean('show_rss'),
        ]);

        return back();
    }
}
