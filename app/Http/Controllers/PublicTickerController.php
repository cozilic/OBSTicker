<?php

namespace App\Http\Controllers;

use App\Services\TickerFeedService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use App\Models\User;
use Inertia\Inertia;
use Inertia\Response;

class PublicTickerController extends Controller
{
    public function show(Request $request): Response
    {
        $owner = $this->ownerFromRequest($request);

        return Inertia::render('ticker/show', [
            'payloadUrl' => route('ticker.payload', ['uuid' => $owner?->ticker_uuid]),
            'submitUrl' => route('ticker.submit', ['uuid' => $owner?->ticker_uuid]),
        ]);
    }

    public function payload(Request $request, TickerFeedService $tickerFeed): JsonResponse
    {
        $owner = $this->ownerFromRequest($request);

        if (! $owner) {
            return response()->json($tickerFeed->emptyPayload());
        }

        return response()->json($tickerFeed->payload($owner));
    }

    private function ownerFromRequest(Request $request): ?User
    {
        $uuid = $request->string('uuid')->toString();

        if ($uuid !== '') {
            return User::query()->where('ticker_uuid', $uuid)->first();
        }

        return User::query()->where('role', 'owner')->oldest()->first();
    }
}
