<?php

use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

test('language settings page is displayed', function () {
    $user = User::factory()->create();

    $this
        ->actingAs($user)
        ->get(route('language.edit'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('settings/language')
            ->where('locales.0.value', 'en')
            ->where('locales.1.value', 'sv'));
});

test('language can be updated', function () {
    $user = User::factory()->create(['locale' => 'en']);

    $this
        ->actingAs($user)
        ->patch(route('language.update'), [
            'locale' => 'sv',
        ])
        ->assertSessionHasNoErrors()
        ->assertRedirect(route('language.edit'));

    expect($user->refresh()->locale)->toBe('sv');
});

test('language must be supported', function () {
    $user = User::factory()->create(['locale' => 'en']);

    $this
        ->actingAs($user)
        ->from(route('language.edit'))
        ->patch(route('language.update'), [
            'locale' => 'de',
        ])
        ->assertSessionHasErrors('locale')
        ->assertRedirect(route('language.edit'));

    expect($user->refresh()->locale)->toBe('en');
});
