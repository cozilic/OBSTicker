<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreTickerMessageRequest;
use App\Models\TickerMessage;
use App\Models\User;
use Illuminate\Http\RedirectResponse;

class TickerMessageController extends Controller
{
    public function store(StoreTickerMessageRequest $request): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();

        TickerMessage::query()->create([
            ...$request->validated(),
            'owner_id' => $user->ownerAccountId(),
            'source_type' => 'admin',
            'status' => 'queued',
            'is_active' => $request->boolean('is_active', true),
            'sort_order' => $request->integer('sort_order'),
        ]);

        return back();
    }

    public function destroy(TickerMessage $tickerMessage): RedirectResponse
    {
        abort_unless($tickerMessage->owner_id === request()->user()?->ownerAccountId(), 403);

        $tickerMessage->delete();

        return back();
    }
}
