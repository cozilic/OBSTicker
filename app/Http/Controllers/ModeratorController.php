<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreModeratorRequest;
use App\Models\User;
use Illuminate\Http\RedirectResponse;

class ModeratorController extends Controller
{
    public function store(StoreModeratorRequest $request): RedirectResponse
    {
        /** @var User $owner */
        $owner = $request->user();

        User::query()->create([
            ...$request->validated(),
            'role' => 'moderator',
            'owner_id' => $owner->id,
        ]);

        return back();
    }
}
