<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreRssFeedRequest;
use App\Models\RssFeed;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Cache;

class RssFeedController extends Controller
{
    public function store(StoreRssFeedRequest $request): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();

        RssFeed::query()->create([
            ...$request->validated(),
            'owner_id' => $user->ownerAccountId(),
            'is_active' => $request->boolean('is_active', true),
            'item_limit' => $request->integer('item_limit', 5),
            'refresh_minutes' => $request->integer('refresh_minutes', 15),
        ]);

        return back();
    }

    public function destroy(RssFeed $rssFeed): RedirectResponse
    {
        abort_unless($rssFeed->owner_id === request()->user()?->ownerAccountId(), 403);

        Cache::forget("ticker:rss-feed:{$rssFeed->owner_id}:{$rssFeed->id}");

        $rssFeed->delete();

        return back();
    }
}
