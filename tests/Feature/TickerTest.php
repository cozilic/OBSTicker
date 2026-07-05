<?php

use App\Models\RssFeed;
use App\Models\SubmissionAccount;
use App\Models\TickerMessage;
use App\Models\TickerSetting;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia as Assert;

test('ticker admin redirects to registration before the first admin exists', function () {
    $this->get(route('ticker.dashboard'))
        ->assertRedirect(route('register'));
});

test('ticker admin redirects guests to login after setup', function () {
    User::factory()->create(['role' => 'owner']);

    $this->get(route('ticker.dashboard'))
        ->assertRedirect(route('login'));
});

test('authenticated users can manage ticker messages', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->post(route('ticker.messages.store'), [
            'source_label' => 'Studio',
            'content' => 'Livesändningen startar snart',
            'is_active' => '1',
            'sort_order' => 3,
        ])
        ->assertRedirect();

    $message = TickerMessage::query()->firstOrFail();

    expect($message->source_label)->toBe('Studio')
        ->and($message->content)->toBe('Livesändningen startar snart')
        ->and($message->source_type)->toBe('admin')
        ->and($message->status)->toBe('queued')
        ->and($message->is_active)->toBeTrue()
        ->and($message->sort_order)->toBe(3);
});

test('ticker dashboard exposes owner specific links', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->get(route('ticker.dashboard'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('ticker/dashboard')
            ->where('tickerUrl', route('ticker.show', ['uuid' => $user->ticker_uuid]))
            ->where('submitUrl', route('ticker.submit', ['uuid' => $user->ticker_uuid])));
});

test('dashboard exposes owner specific submit link', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('dashboard')
            ->where('submitUrl', route('ticker.submit', ['uuid' => $user->ticker_uuid])));
});

test('moderator dashboard exposes owner specific submit link', function () {
    $owner = User::factory()->create();
    $moderator = User::factory()->create([
        'role' => 'moderator',
        'owner_id' => $owner->id,
        'ticker_uuid' => null,
    ]);

    $this->actingAs($moderator)
        ->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('dashboard')
            ->where('submitUrl', route('ticker.submit', ['uuid' => $owner->ticker_uuid])));
});

test('public ticker page renders the fullscreen ticker view', function () {
    $owner = User::factory()->create();

    $this->get(route('ticker.show', ['uuid' => $owner->ticker_uuid]))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('ticker/show')
            ->where('payloadUrl', route('ticker.payload', ['uuid' => $owner->ticker_uuid]))
            ->where('submitUrl', route('ticker.submit', ['uuid' => $owner->ticker_uuid])));
});

test('public users can submit text to the ticker queue', function () {
    $owner = User::factory()->create();

    $this->post(route('ticker.submissions.store', ['uuid' => $owner->ticker_uuid]), [
        'submitter_name' => 'Patrik',
        'content' => 'Hej från publiken',
    ])->assertRedirect();

    $message = TickerMessage::query()->firstOrFail();

    expect($message->source_type)->toBe('user')
        ->and($message->owner_id)->toBe($owner->id)
        ->and($message->submitter_name)->toBe('Patrik')
        ->and($message->content)->toBe('Hej från publiken')
        ->and($message->status)->toBe('queued');
});

test('submission page prompts for twitch login when required', function () {
    $owner = User::factory()->create();
    TickerSetting::current($owner)->update(['require_auth_to_submit' => true]);

    $this->get(route('ticker.submit', ['uuid' => $owner->ticker_uuid]))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('ticker/submit')
            ->where('requiresTwitchAuth', true)
            ->where('isTwitchAuthenticated', false)
            ->where('connectUrl', route('ticker.submitter.twitch.redirect', ['return_to' => route('ticker.submit', ['uuid' => $owner->ticker_uuid])]))
            ->where('submitterName', null));
});

test('submitters can authenticate with twitch', function () {
    $owner = User::factory()->create();

    Http::fake([
        'id.twitch.tv/oauth2/token' => Http::response([
            'access_token' => 'twitch-access-token',
            'expires_in' => 3600,
            'token_type' => 'bearer',
        ]),
        'api.twitch.tv/helix/users' => Http::response([
            'data' => [
                [
                    'id' => '123456',
                    'login' => 'streamername',
                    'display_name' => 'StreamerName',
                    'profile_image_url' => 'https://example.com/avatar.png',
                ],
            ],
        ]),
    ]);

    $this->withSession([
        'ticker.submitter.state' => 'state-token',
        'ticker.submitter.return_to' => route('ticker.submit', ['uuid' => $owner->ticker_uuid]),
    ])
        ->get(route('ticker.submitter.twitch.callback', [
            'code' => 'auth-code',
            'state' => 'state-token',
        ]))
        ->assertRedirect(route('ticker.submit', ['uuid' => $owner->ticker_uuid]));

    $this->assertAuthenticated('submitter');

    $submitter = SubmissionAccount::query()->firstOrFail();

    expect($submitter->twitch_id)->toBe('123456')
        ->and($submitter->twitch_login)->toBe('streamername')
        ->and($submitter->display_name)->toBe('StreamerName')
        ->and($submitter->avatar_url)->toBe('https://example.com/avatar.png');
});

test('authenticated twitch submitters can submit when submission auth is required', function () {
    $owner = User::factory()->create();
    $submitter = SubmissionAccount::query()->create([
        'twitch_id' => '123456',
        'twitch_login' => 'streamername',
        'display_name' => 'StreamerName',
        'avatar_url' => 'https://example.com/avatar.png',
    ]);
    TickerSetting::current($owner)->update(['require_auth_to_submit' => true]);

    $this->actingAs($submitter, 'submitter')
        ->post(route('ticker.submissions.store', ['uuid' => $owner->ticker_uuid]), [
            'content' => 'Hej med inloggning',
        ])
        ->assertRedirect();

    $message = TickerMessage::query()->firstOrFail();

    expect($message->content)->toBe('Hej med inloggning')
        ->and($message->source_label)->toBe('StreamerName');
});

test('public ticker submissions use the submitter name as label', function () {
    $owner = User::factory()->create();

    $this->post(route('ticker.submissions.store', ['uuid' => $owner->ticker_uuid]), [
        'submitter_name' => 'Patrik',
        'content' => 'Hej igen',
    ])->assertRedirect();

    $message = TickerMessage::query()->firstOrFail();

    expect($message->source_label)->toBe('Patrik');
});

test('public ticker payload prioritizes queued user text over rss', function () {
    $owner = User::factory()->create();

    Http::fake([
        'example.com/rss' => Http::response(
            '<?xml version="1.0"?><rss><channel><item><title>RSS rubrik ett</title><link>https://example.com/ett</link></item></channel></rss>',
            200,
            ['Content-Type' => 'application/rss+xml'],
        ),
    ]);

    TickerSetting::current($owner)->update(['headline' => 'OBS']);
    TickerMessage::factory()->create([
        'owner_id' => $owner->id,
        'source_label' => 'Manuell',
        'content' => 'Direkt från webben',
        'sort_order' => 1,
    ]);
    RssFeed::factory()->create([
        'owner_id' => $owner->id,
        'name' => 'Nyheter',
        'url' => 'https://example.com/rss',
        'item_limit' => 2,
    ]);

    $this->getJson(route('ticker.payload', ['uuid' => $owner->ticker_uuid]))
        ->assertSuccessful()
        ->assertJsonPath('settings.headline', 'OBS')
        ->assertJsonPath('settings.rss_headline', 'Latest news')
        ->assertJsonPath('settings.user_headline', 'Latest text')
        ->assertJsonPath('settings.canvas_width', 1920)
        ->assertJsonPath('settings.canvas_height', 1080)
        ->assertJsonPath('settings.animation_style', 'slide-left')
        ->assertJsonPath('settings.animation_duration_seconds', 1)
        ->assertJsonPath('settings.label_position', 'left')
        ->assertJsonPath('settings.chroma_key_color', 'green')
        ->assertJsonPath('items.0.text', 'Direkt från webben')
        ->assertJsonCount(1, 'items');

    expect(TickerMessage::query()->firstOrFail()->status)->toBe('playing');
});

test('ticker settings default to english', function () {
    $user = User::factory()->create();

    $settings = TickerSetting::current($user);

    expect($settings->headline)->toBe('Latest news')
        ->and($settings->rss_headline)->toBe('Latest news')
        ->and($settings->user_headline)->toBe('Latest text');
});

test('public ticker payload uses rss when the user queue is empty', function () {
    $owner = User::factory()->create();

    Http::fake([
        'example.com/rss' => Http::response(
            '<?xml version="1.0"?><rss><channel><item><title>RSS rubrik ett</title><link>https://example.com/ett</link></item><item><title>RSS rubrik två</title><link>https://example.com/tva</link></item></channel></rss>',
            200,
            ['Content-Type' => 'application/rss+xml'],
        ),
    ]);

    RssFeed::factory()->create([
        'owner_id' => $owner->id,
        'name' => 'Nyheter',
        'url' => 'https://example.com/rss',
        'item_limit' => 2,
    ]);

    $this->getJson(route('ticker.payload', ['uuid' => $owner->ticker_uuid]))
        ->assertSuccessful()
        ->assertJsonPath('items.0.label', 'Nyheter')
        ->assertJsonPath('items.0.text', 'RSS rubrik ett')
        ->assertJsonPath('items.1.label', 'Nyheter')
        ->assertJsonPath('items.1.text', 'RSS rubrik två')
        ->assertJsonCount(2, 'items');
});

test('public ticker payload interleaves multiple rss feeds', function () {
    $owner = User::factory()->create();

    Http::fake([
        'first.test/rss' => Http::response(
            '<?xml version="1.0"?><rss><channel><item><title>Första ett</title><link>https://first.test/1</link></item><item><title>Första två</title><link>https://first.test/2</link></item></channel></rss>',
            200,
            ['Content-Type' => 'application/rss+xml'],
        ),
        'second.test/rss' => Http::response(
            '<?xml version="1.0"?><rss><channel><item><title>Andra ett</title><link>https://second.test/1</link></item></channel></rss>',
            200,
            ['Content-Type' => 'application/rss+xml'],
        ),
    ]);

    RssFeed::factory()->create([
        'owner_id' => $owner->id,
        'name' => 'Alpha',
        'url' => 'https://first.test/rss',
        'item_limit' => 2,
    ]);

    RssFeed::factory()->create([
        'owner_id' => $owner->id,
        'name' => 'Beta',
        'url' => 'https://second.test/rss',
        'item_limit' => 2,
    ]);

    $this->getJson(route('ticker.payload', ['uuid' => $owner->ticker_uuid]))
        ->assertSuccessful()
        ->assertJsonPath('items.0.label', 'Alpha')
        ->assertJsonPath('items.0.text', 'Första ett')
        ->assertJsonPath('items.1.label', 'Beta')
        ->assertJsonPath('items.1.text', 'Andra ett')
        ->assertJsonPath('items.2.label', 'Alpha')
        ->assertJsonPath('items.2.text', 'Första två')
        ->assertJsonCount(3, 'items');
});

test('queued text preempts rss playback immediately', function () {
    $owner = User::factory()->create();

    Http::fake([
        'example.com/rss' => Http::response(
            '<?xml version="1.0"?><rss><channel><item><title>RSS rubrik ett</title><link>https://example.com/ett</link></item><item><title>RSS rubrik två</title><link>https://example.com/tva</link></item></channel></rss>',
            200,
            ['Content-Type' => 'application/rss+xml'],
        ),
    ]);

    RssFeed::factory()->create([
        'owner_id' => $owner->id,
        'name' => 'Nyheter',
        'url' => 'https://example.com/rss',
        'item_limit' => 2,
    ]);

    $this->getJson(route('ticker.payload', ['uuid' => $owner->ticker_uuid]))
        ->assertSuccessful()
        ->assertJsonPath('items.0.text', 'RSS rubrik ett')
        ->assertJsonPath('items.1.text', 'RSS rubrik två')
        ->assertJsonCount(2, 'items');

    TickerMessage::factory()->create([
        'owner_id' => $owner->id,
        'source_label' => 'Publik',
        'content' => 'Ny text ska vänta',
        'sort_order' => 1,
    ]);

    $this->getJson(route('ticker.payload', ['uuid' => $owner->ticker_uuid]))
        ->assertSuccessful()
        ->assertJsonPath('items.0.type', 'message')
        ->assertJsonPath('items.0.text', 'Ny text ska vänta');

    expect(TickerMessage::query()->firstOrFail()->status)->toBe('playing');
});

test('ticker settings can be updated', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->put(route('ticker.settings.update'), [
            'headline' => 'Live',
            'rss_headline' => 'News',
            'user_headline' => 'Latest chat',
            'background_color' => '#020617',
            'text_color' => '#f8fafc',
            'accent_color' => '#22c55e',
            'canvas_width' => 1280,
            'canvas_height' => 720,
            'animation_duration_seconds' => 2,
            'animation_out_duration_seconds' => 3,
            'animation_style' => 'fade',
            'shape_style' => 'pill',
            'label_position' => 'right',
            'chroma_key_color' => 'blue',
            'image_url' => 'https://example.com/logo.png',
            'crawl_duration_seconds' => 45,
            'message_display_seconds' => 15,
            'poll_interval_seconds' => 10,
            'show_rss' => '0',
        ])
        ->assertRedirect();

    $settings = TickerSetting::current($user);

    expect($settings->headline)->toBe('Live')
        ->and($settings->rss_headline)->toBe('News')
        ->and($settings->user_headline)->toBe('Latest chat')
        ->and($settings->canvas_width)->toBe(1280)
        ->and($settings->canvas_height)->toBe(720)
        ->and($settings->animation_duration_seconds)->toBe(2)
        ->and($settings->animation_out_duration_seconds)->toBe(3)
        ->and($settings->animation_style)->toBe('fade')
        ->and($settings->shape_style)->toBe('pill')
        ->and($settings->label_position)->toBe('right')
        ->and($settings->chroma_key_color)->toBe('blue')
        ->and($settings->image_url)->toBe('https://example.com/logo.png')
        ->and($settings->show_rss)->toBeFalse()
        ->and($settings->crawl_duration_seconds)->toBe(45)
        ->and($settings->message_display_seconds)->toBe(15);
});

test('owners can add moderators', function () {
    $owner = User::factory()->create(['role' => 'owner']);

    $this->actingAs($owner)
        ->post(route('ticker.moderators.store'), [
            'name' => 'Moderator',
            'email' => 'moderator@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ])
        ->assertRedirect();

    expect(User::query()->where('email', 'moderator@example.com')->firstOrFail()->role)
        ->toBe('moderator');
});

test('moderators cannot add moderators', function () {
    $moderator = User::factory()->create(['role' => 'moderator']);

    $this->actingAs($moderator)
        ->post(route('ticker.moderators.store'), [
            'name' => 'Other Moderator',
            'email' => 'other@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ])
        ->assertForbidden();
});
