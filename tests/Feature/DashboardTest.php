<?php

use App\Models\RssFeed;
use App\Models\TickerMessage;
use App\Models\User;

test('guests are redirected to the login page', function () {
    $response = $this->get(route('dashboard'));
    $response->assertRedirect(route('login'));
});

test('authenticated users can visit the dashboard', function () {
    $user = User::factory()->create();
    TickerMessage::factory()->create(['owner_id' => $user->id, 'status' => 'queued']);
    TickerMessage::factory()->create(['owner_id' => $user->id, 'status' => 'played', 'source_type' => 'user']);
    RssFeed::factory()->create(['owner_id' => $user->id, 'is_active' => true]);
    $this->actingAs($user);

    $response = $this->get(route('dashboard'));
    $response
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('dashboard')
            ->where('stats.queuedMessages', 1)
            ->where('stats.playedMessages', 1)
            ->where('stats.activeRssFeeds', 1));
});
