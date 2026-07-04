<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreTickerSubmissionRequest;
use App\Models\TickerMessage;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class TickerSubmissionController extends Controller
{
    public function create(Request $request): Response
    {
        $owner = $this->ownerFromRequest($request);

        return Inertia::render('ticker/submit', [
            'tickerName' => $owner?->name,
            'submissionUrl' => route('ticker.submissions.store', ['uuid' => $owner?->ticker_uuid]),
        ]);
    }

    public function store(StoreTickerSubmissionRequest $request): RedirectResponse
    {
        $owner = $this->ownerFromRequest($request);

        abort_if(! $owner, 404);

        $data = $request->validated();

        TickerMessage::query()->create([
            ...$data,
            'owner_id' => $owner->id,
            'source_type' => 'user',
            'source_label' => $data['submitter_name'] ?: 'Publik',
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
}
