<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreTickerMessageRequest;
use App\Models\TickerMessage;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class TickerMessageController extends Controller
{
    public function store(StoreTickerMessageRequest $request): RedirectResponse
    {
        $user = $request->user('web');
        abort_unless($user instanceof User, 403);

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

    public function destroy(Request $request, TickerMessage $tickerMessage): RedirectResponse
    {
        $user = $request->user('web');
        abort_unless($user instanceof User, 403);
        abort_unless($tickerMessage->owner_id === $user->ownerAccountId(), 403);

        $tickerMessage->delete();

        return back();
    }
}
