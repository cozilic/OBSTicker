<?php

namespace App\Http\Controllers;

use App\Models\RssFeed;
use App\Models\TickerMessage;
use App\Models\User;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    public function __invoke(Request $request): Response
    {
        /** @var User $user */
        $user = $request->user();
        $ownerId = $user->ownerAccountId();

        return Inertia::render('dashboard', [
            'stats' => [
                'queuedMessages' => TickerMessage::query()->forOwner($ownerId)->where('status', 'queued')->count(),
                'playingMessages' => TickerMessage::query()->forOwner($ownerId)->where('status', 'playing')->count(),
                'playedMessages' => TickerMessage::query()->forOwner($ownerId)->where('status', 'played')->count(),
                'todaysSubmissions' => TickerMessage::query()
                    ->forOwner($ownerId)
                    ->where('source_type', 'user')
                    ->whereDate('created_at', today())
                    ->count(),
                'activeRssFeeds' => RssFeed::query()->forOwner($ownerId)->where('is_active', true)->count(),
                'moderators' => User::query()->where('owner_id', $ownerId)->where('role', 'moderator')->count(),
            ],
            'latestMessages' => TickerMessage::query()
                ->forOwner($ownerId)
                ->latest()
                ->limit(5)
                ->get(['id', 'source_type', 'submitter_name', 'content', 'status', 'created_at']),
            'submitUrl' => route('ticker.submit', ['uuid' => $user->ticker_uuid]),
        ]);
    }
}
