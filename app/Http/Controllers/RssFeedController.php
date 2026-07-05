<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreRssFeedRequest;
use App\Models\RssFeed;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class RssFeedController extends Controller
{
    public function store(StoreRssFeedRequest $request): RedirectResponse
    {
        $user = $request->user('web');
        abort_unless($user instanceof User, 403);

        RssFeed::query()->create([
            ...$request->validated(),
            'owner_id' => $user->ownerAccountId(),
            'is_active' => $request->boolean('is_active', true),
            'item_limit' => $request->integer('item_limit', 5),
            'refresh_minutes' => $request->integer('refresh_minutes', 15),
        ]);

        return back();
    }

    public function destroy(Request $request, RssFeed $rssFeed): RedirectResponse
    {
        $user = $request->user('web');
        abort_unless($user instanceof User, 403);
        abort_unless($rssFeed->owner_id === $user->ownerAccountId(), 403);

        Cache::forget("ticker:rss-feed:{$rssFeed->owner_id}:{$rssFeed->id}");

        $rssFeed->delete();

        return back();
    }
}
