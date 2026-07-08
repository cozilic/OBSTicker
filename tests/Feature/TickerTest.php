<?php

use App\Models\RssFeed;
use App\Models\SubmissionAccount;
use App\Models\ThemeSubmission;
use App\Models\TickerMessage;
use App\Models\TickerSetting;
use App\Models\User;
use App\Services\TickerStyleRepository;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;

afterEach(function (): void {
    File::delete(public_path('ticker-styles/scoreboard.png'));
    File::delete(public_path('ticker-styles/ticker.PNG'));
    File::delete(public_path('ticker-styles/aurora.png'));
    File::delete(public_path('ticker-styles/aurora.json'));
    File::deleteDirectory(public_path('ticker-styles/aurora'));
    File::deleteDirectory(public_path('ticker-styles/dusk'));
    File::deleteDirectory(public_path('ticker-styles/broken-theme'));
    File::deleteDirectory(public_path('ticker-styles/compiled'));
    File::deleteDirectory(public_path('ticker-theme-shares'));
    Storage::disk('local')->deleteDirectory('theme-submissions');
    File::delete(public_path('ticker-styles/dusk.png'));
    File::delete(public_path('ticker-styles/dusk.json'));
    File::delete(public_path('ticker-styles/Dusk.png'));
    File::delete(public_path('ticker-styles/Dusk.json'));
    File::delete(public_path('ticker-styles/Dusk/Dusk.json'));
    File::deleteDirectory(public_path('ticker-styles/Dusk'));
    File::delete('/tmp/theme-upload.zip');
});

function createTickerStyleFixture(string $filename = 'scoreboard.png'): string
{
    $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', true);

    if (! is_string($png)) {
        throw new RuntimeException('Unable to create ticker style fixture.');
    }

    File::ensureDirectoryExists(public_path('ticker-styles'));
    File::put(public_path('ticker-styles/'.$filename), $png);

    return $filename;
}

function createTickerThemeFixture(string $directory = 'dusk'): string
{
    $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', true);

    if (! is_string($png)) {
        throw new RuntimeException('Unable to create ticker theme fixture.');
    }

    $themeDir = public_path('ticker-styles/'.$directory);
    File::ensureDirectoryExists($themeDir);
    File::put($themeDir.'/title.png', $png);
    File::put($themeDir.'/content.png', $png);
    File::put($themeDir.'/end.png', $png);
    File::put($themeDir.'/'.$directory.'.json', json_encode([
        'name' => 'Dusk',
        'theme_name' => $directory,
        'author' => 'Fixture Author',
        'created_at' => '2026-07-07 00:00:00',
    ], JSON_PRETTY_PRINT));

    return $directory.'.png';
}

function createBrokenTickerThemeFixture(string $directory = 'broken-theme'): void
{
    $themeDir = public_path('ticker-styles/'.$directory);
    File::ensureDirectoryExists($themeDir);
    File::put($themeDir.'/title.png', 'not-a-valid-png');
    File::put($themeDir.'/content.png', 'still-not-a-valid-png');
    File::put($themeDir.'/end.png', 'also-not-a-valid-png');
    File::put($themeDir.'/'.$directory.'.json', json_encode([
        'name' => 'Broken Theme',
        'theme_name' => $directory,
        'author' => 'Fixture Author',
        'created_at' => '2026-07-07 00:00:00',
    ], JSON_PRETTY_PRINT));
}

function createThemeZipFixture(string $themeName = 'aurora', string $author = 'Aggen'): string
{
    $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', true);

    if (! is_string($png)) {
        throw new RuntimeException('Unable to create theme zip fixture.');
    }

    $zipPath = '/tmp/theme-upload.zip';
    if (is_file($zipPath)) {
        File::delete($zipPath);
    }

    $zip = new ZipArchive;
    if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        throw new RuntimeException('Unable to open theme zip fixture.');
    }

    $zip->addFromString('title.PNG', $png);
    $zip->addFromString('content.png', $png);
    $zip->addFromString('end.png', $png);
    $zip->addFromString($themeName.'.json', json_encode([
        'name' => 'Aurora',
        'theme_name' => $themeName,
        'author' => $author,
        'created_at' => '2026-07-07 00:00:00',
    ], JSON_PRETTY_PRINT));
    $zip->close();

    return $zipPath;
}

test('ticker admin redirects to registration before the first admin exists', function () {
    $this->get(route('ticker.dashboard'))
        ->assertRedirect(route('register'));
});

test('ticker admin redirects guests to login after setup', function () {
    User::factory()->create(['role' => 'owner']);

    $this->get(route('ticker.dashboard'))
        ->assertRedirect(route('login'));
});

test('landing page hides the public themes link by default', function () {
    $this->get(route('home'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('welcome')
            ->where('features.themeLandingLinkEnabled', false));
});

test('landing page can show the public themes link on the main site', function () {
    config(['ticker.themes.landing_link_enabled' => true]);

    $this->get(route('home'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('welcome')
            ->where('features.themeLandingLinkEnabled', true));
});

test('public themes list is available on its own route', function () {
    $this->get(route('themes.index'))
        ->assertOk()
        ->assertHeaderMissing('Link')
        ->assertInertia(fn (Assert $page) => $page
            ->component('themes/index'));
});

test('public themes list skips broken theme assets instead of failing', function () {
    createTickerThemeFixture('dusk');
    createBrokenTickerThemeFixture('broken-theme');

    $this->get(route('ticker.themes.index'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('ticker/themes')
            ->where('themes.data', fn (mixed $themes): bool => collect($themes)->contains(fn (array $theme): bool => $theme['slug'] === 'dusk')));
});

test('public visitors can open the theme submission form', function () {
    config(['ticker.themes.official_catalog_url' => config('app.url').'/themes']);

    $this->get(route('themes.submit'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('themes/submit')
            ->where('officialCatalogUrl', config('app.url').'/themes'));
});

test('visitors can submit a theme for moderation', function () {
    config(['ticker.themes.official_catalog_url' => config('app.url').'/themes']);

    $zipPath = createThemeZipFixture('aurora', 'Alex Example');

    $this->post(route('themes.submissions.store'), [
        'theme_name' => 'Aurora',
        'author_name' => 'Alex Example',
        'submitter_name' => 'Patrik',
        'submitter_email' => 'patrik@example.com',
        'notes' => 'Please review this theme.',
        'theme_zip' => new UploadedFile($zipPath, 'aurora.zip', 'application/zip', null, true),
    ])
        ->assertRedirect(route('themes.index'));

    $submission = ThemeSubmission::query()->firstOrFail();

    expect($submission->theme_name)->toBe('Aurora')
        ->and($submission->theme_slug)->toBe('aurora')
        ->and($submission->author_name)->toBe('Alex Example')
        ->and($submission->status)->toBe('pending');

    expect(Storage::disk('local')->exists($submission->archive_path))->toBeTrue();
});

test('owners can review theme submissions', function () {
    config(['ticker.themes.official_catalog_url' => config('app.url').'/themes']);

    $owner = User::factory()->create([
        'role' => 'owner',
        'email' => config('ticker.owner_email'),
    ]);
    $zipPath = createThemeZipFixture('aurora', 'Alex Example');

    $this->post(route('themes.submissions.store'), [
        'theme_name' => 'Aurora',
        'author_name' => 'Alex Example',
        'theme_zip' => new UploadedFile($zipPath, 'aurora.zip', 'application/zip', null, true),
    ])->assertRedirect(route('themes.index'));

    $submission = ThemeSubmission::query()->firstOrFail();

    $this->actingAs($owner)
        ->get(route('ticker.theme-submissions.index'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('ticker/theme-submissions')
            ->where('submissions.data', fn (mixed $items): bool => collect($items)->contains(fn (array $item): bool => $item['theme_slug'] === 'aurora' && $item['status'] === 'pending')));

    $this->actingAs($owner)
        ->post(route('ticker.theme-submissions.approve', ['themeSubmission' => $submission]))
        ->assertRedirect();

    $submission->refresh();

    expect($submission->status)->toBe('approved')
        ->and($submission->published_theme_slug)->toBe('aurora')
        ->and(File::exists(public_path('ticker-styles/aurora/title.png')))->toBeTrue()
        ->and(File::exists(public_path('ticker-styles/aurora/aurora.json')))->toBeTrue()
        ->and(Storage::disk('local')->exists($submission->archive_path))->toBeFalse();
});

test('theme approval reports unexpected import failures instead of crashing', function () {
    config(['ticker.themes.official_catalog_url' => config('app.url').'/themes']);

    $owner = User::factory()->create([
        'role' => 'owner',
        'email' => config('ticker.owner_email'),
    ]);
    Storage::disk('local')->put('theme-submissions/aurora-test.zip', 'not-a-real-zip');
    $submission = ThemeSubmission::query()->create([
        'theme_name' => 'Aurora',
        'theme_slug' => 'aurora',
        'author_name' => 'Alex Example',
        'archive_path' => 'theme-submissions/aurora-test.zip',
        'source_type' => 'upload',
        'status' => 'pending',
    ]);

    $this->mock(TickerStyleRepository::class, function ($mock): void {
        $mock->shouldReceive('existsTheme')->andReturnFalse();
        $mock->shouldReceive('importThemeZip')->andThrow(new Error('boom'));
    });

    $this->actingAs($owner)
        ->post(route('ticker.theme-submissions.approve', ['themeSubmission' => $submission]))
        ->assertRedirect()
        ->assertSessionHasErrors('submission');
});

test('owners can delete rejected theme submissions', function () {
    config(['ticker.themes.official_catalog_url' => config('app.url').'/themes']);

    $owner = User::factory()->create([
        'role' => 'owner',
        'email' => config('ticker.owner_email'),
    ]);

    Storage::disk('local')->put('theme-submissions/rejected-theme.zip', 'not-a-real-zip');

    $submission = ThemeSubmission::query()->create([
        'theme_name' => 'Rejected Theme',
        'theme_slug' => 'rejected-theme',
        'author_name' => 'Alex Example',
        'archive_path' => 'theme-submissions/rejected-theme.zip',
        'source_type' => 'upload',
        'status' => 'rejected',
        'rejection_reason' => 'Not ready yet.',
    ]);

    $this->actingAs($owner)
        ->delete(route('ticker.theme-submissions.destroy', ['themeSubmission' => $submission]))
        ->assertRedirect();

    expect(ThemeSubmission::query()->whereKey($submission->id)->exists())->toBeFalse()
        ->and(Storage::disk('local')->exists('theme-submissions/rejected-theme.zip'))->toBeFalse();
});

test('self hosted installs do not expose theme submissions navigation', function () {
    $owner = User::factory()->create([
        'role' => 'owner',
        'email' => 'someone-else@example.com',
    ]);

    $this->actingAs($owner)
        ->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('isOfficialCatalogHost', false)
            ->where('canModerateThemes', false));
});

test('only the platform owner email can moderate theme submissions', function () {
    config(['ticker.themes.official_catalog_url' => config('app.url').'/themes']);

    $nonOwner = User::factory()->create([
        'role' => 'owner',
        'email' => 'someone-else@example.com',
    ]);

    $this->actingAs($nonOwner)
        ->get(route('ticker.theme-submissions.index'))
        ->assertForbidden();
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
    $style = createTickerThemeFixture('dusk');
    $user = User::factory()->create();

    $this->actingAs($user)
        ->get(route('ticker.dashboard'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('ticker/dashboard')
            ->where('settings.ticker_use_image_style', true)
            ->where('tickerUrl', route('ticker.show', ['uuid' => $user->ticker_uuid]))
            ->where('submitUrl', route('ticker.submit', ['uuid' => $user->ticker_uuid]))
            ->where('tickerStyles', fn (mixed $styles): bool => collect($styles)->contains(fn (array $styleOption): bool => $styleOption['value'] === $style && $styleOption['label'] === 'Dusk' && $styleOption['url'] === '/ticker-styles/compiled/dusk.png') && ! collect($styles)->contains(fn (array $styleOption): bool => $styleOption['value'] === 'ticker.PNG')));
});

test('ticker theme page is accessible to authenticated users', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->get(route('ticker.theme'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('ticker/theme'));
});

test('guests can browse the public themes catalog', function () {
    File::deleteDirectory(public_path('ticker-styles'));

    createTickerThemeFixture('dusk');

    $this->get(route('ticker.themes.index'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('ticker/themes')
            ->where('themes.meta.current_page', 1)
            ->where('themes.meta.per_page', 10)
            ->where('themes.data', fn (mixed $themes): bool => collect($themes)->contains(fn (array $theme): bool => $theme['slug'] === 'dusk')));
});

test('guests can preview public themes', function () {
    createTickerThemeFixture('dusk');

    $this->get(route('ticker.themes.show', ['theme' => 'dusk']))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('ticker/theme-preview')
            ->where('theme.slug', 'dusk'));
});

test('themes page lists imported themes and supports deletion', function () {
    $user = User::factory()->create();
    $zipPath = createThemeZipFixture('aurora', 'Alex Example');

    $this->actingAs($user)
        ->post(route('ticker.themes.store'), [
            'theme_zip' => new UploadedFile($zipPath, 'aurora.zip', 'application/zip', null, true),
        ])
        ->assertRedirect(route('ticker.themes.show', ['theme' => 'aurora']));

    $this->actingAs($user)
        ->get(route('ticker.themes.show', ['theme' => 'aurora']))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('ticker/theme-preview')
            ->where('theme.slug', 'aurora')
            ->where('theme.label', 'Aurora')
            ->where('theme.author', 'Alex Example'));

    $this->actingAs($user)
        ->get(route('ticker.themes.index'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('ticker/themes')
            ->where('createThemeUrl', route('ticker.theme'))
            ->where('features.themeCatalogEnabled', true)
            ->where('features.themeOfficialCatalogLinkEnabled', true)
            ->where('themeCatalogUrl', 'https://ticker.norrnet.online/themes')
            ->where('themes.meta.current_page', 1)
            ->where('themes.meta.per_page', 10)
            ->where('themes.data', fn (mixed $themes): bool => collect($themes)->contains(fn (array $theme): bool => $theme['slug'] === 'aurora' && $theme['label'] === 'Aurora' && $theme['author'] === 'Alex Example' && $theme['downloadUrl'] === route('ticker.themes.share.download', ['theme' => 'aurora']))));

    TickerSetting::current($user)->update([
        'ticker_style' => 'aurora.png',
        'ticker_use_image_style' => true,
    ]);

    $this->actingAs($user)
        ->delete(route('ticker.themes.destroy', ['theme' => 'aurora']))
        ->assertRedirect();

    expect(File::exists(public_path('ticker-styles/aurora')))->toBeFalse()
        ->and(File::exists(public_path('ticker-styles/compiled/aurora.png')))->toBeFalse()
        ->and(File::exists(public_path('ticker-styles/compiled/aurora.json')))->toBeFalse()
        ->and(File::exists(public_path('ticker-styles/aurora.png')))->toBeFalse()
        ->and(File::exists(public_path('ticker-styles/aurora.json')))->toBeFalse();

    $settings = TickerSetting::current($user);
    expect($settings->ticker_style)->toBeNull()
        ->and($settings->ticker_use_image_style)->toBeFalse();
});

test('themes page paginates at ten themes per page', function () {
    $user = User::factory()->create();

    File::deleteDirectory(public_path('ticker-styles'));
    File::ensureDirectoryExists(public_path('ticker-styles'));

    for ($index = 1; $index <= 11; $index++) {
        createTickerThemeFixture('theme-'.$index);
    }

    $this->actingAs($user)
        ->get(route('ticker.themes.index'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('ticker/themes')
            ->where('themes.meta.current_page', 1)
            ->where('themes.meta.per_page', 10)
            ->where('themes.meta.last_page', 2)
            ->where('themes.data', fn (mixed $themes): bool => count($themes) === 10));

    $this->actingAs($user)
        ->get(route('ticker.themes.index', ['page' => 2]))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('ticker/themes')
            ->where('themes.meta.current_page', 2)
            ->where('themes.meta.per_page', 10)
            ->where('themes.meta.last_page', 2)
            ->where('themes.data', fn (mixed $themes): bool => count($themes) === 1));

    File::deleteDirectory(public_path('ticker-styles'));
});

test('themes can be shared and imported from a url', function () {
    $user = User::factory()->create();
    $zipPath = createThemeZipFixture('aurora', 'Alex Example');

    $this->actingAs($user)
        ->post(route('ticker.themes.store'), [
            'theme_zip' => new UploadedFile($zipPath, 'aurora.zip', 'application/zip', null, true),
        ])
        ->assertRedirect(route('ticker.themes.show', ['theme' => 'aurora']));

    $this->actingAs($user)
        ->get(route('ticker.themes.share', ['theme' => 'aurora']))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('ticker/theme-share')
            ->where('theme.slug', 'aurora')
            ->where('theme.label', 'Aurora')
            ->where('theme.author', 'Alex Example')
            ->where('generateShareUrlAction', route('ticker.themes.share.url', ['theme' => 'aurora']))
            ->where('shareUrl', null));

    $this->actingAs($user)
        ->get(route('ticker.themes.share.download', ['theme' => 'aurora']))
        ->assertDownload('aurora.zip');

    $this->actingAs($user)
        ->post(route('ticker.themes.share.url', ['theme' => 'aurora']))
        ->assertRedirect(route('ticker.themes.share', ['theme' => 'aurora', 'share_url' => '/ticker-theme-shares/aurora.zip']));

    $this->actingAs($user)
        ->postJson(route('ticker.themes.share.url', ['theme' => 'aurora']))
        ->assertOk()
        ->assertJson([
            'share_url' => '/ticker-theme-shares/aurora.zip',
        ]);

    expect(File::exists(public_path('ticker-theme-shares/aurora.zip')))->toBeTrue();

    $this->actingAs($user)
        ->get(route('ticker.themes.share', ['theme' => 'aurora', 'share_url' => '/ticker-theme-shares/aurora.zip']))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('ticker/theme-share')
            ->where('shareUrl', '/ticker-theme-shares/aurora.zip'));

    Http::fake([
        'https://example.test/themes/aurora.zip' => Http::response(
            File::get($zipPath),
            200,
            ['Content-Type' => 'application/zip'],
        ),
    ]);

    $this->actingAs($user)
        ->post(route('ticker.themes.store'), [
            'theme_url' => 'https://example.test/themes/aurora.zip',
        ])
        ->assertRedirect(route('ticker.themes.show', ['theme' => 'aurora']));

    $this->actingAs($user)
        ->get(route('ticker.themes.show', ['theme' => 'aurora']))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('ticker/theme-preview')
            ->where('theme.slug', 'aurora')
            ->where('theme.label', 'Aurora')
            ->where('theme.author', 'Alex Example'));
});

test('theme catalog routes can be disabled per deployment', function () {
    config(['ticker.themes.catalog_enabled' => false]);
    $user = User::factory()->create();

    $this->actingAs($user)
        ->get(route('ticker.themes.index'))
        ->assertNotFound();
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

test('submission page prompts for moderator login when moderator only submissions are enabled', function () {
    $owner = User::factory()->create();
    TickerSetting::current($owner)->update([
        'require_auth_to_submit' => true,
        'moderator_only_submissions' => true,
    ]);

    $this->get(route('ticker.submit', ['uuid' => $owner->ticker_uuid]))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('ticker/submit')
            ->where('requiresModerator', true)
            ->where('isModeratorAuthenticated', false)
            ->where('requiresTwitchAuth', false)
            ->where('loginUrl', route('login')));
});

test('public users cannot submit when moderator only submissions are enabled', function () {
    $owner = User::factory()->create();
    TickerSetting::current($owner)->update(['moderator_only_submissions' => true]);

    $this->post(route('ticker.submissions.store', ['uuid' => $owner->ticker_uuid]), [
        'submitter_name' => 'Publik',
        'content' => '2-1 i finalen',
    ])->assertRedirect(route('login'));

    expect(TickerMessage::query()->count())->toBe(0);
});

test('workspace moderators can submit when moderator only submissions are enabled', function () {
    $owner = User::factory()->create(['role' => 'owner']);
    $moderator = User::factory()->create([
        'name' => 'Scorekeeper',
        'role' => 'moderator',
        'owner_id' => $owner->id,
        'ticker_uuid' => null,
    ]);
    TickerSetting::current($owner)->update(['moderator_only_submissions' => true]);

    $this->actingAs($moderator)
        ->post(route('ticker.submissions.store', ['uuid' => $owner->ticker_uuid]), [
            'content' => 'Team Blue leder 2-1',
        ])
        ->assertRedirect();

    $message = TickerMessage::query()->firstOrFail();

    expect($message->owner_id)->toBe($owner->id)
        ->and($message->content)->toBe('Team Blue leder 2-1')
        ->and($message->source_label)->toBe('Scorekeeper');
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
    $style = createTickerStyleFixture();
    $owner = User::factory()->create();

    Http::fake([
        'example.com/rss' => Http::response(
            '<?xml version="1.0"?><rss><channel><item><title>RSS rubrik ett</title><link>https://example.com/ett</link></item></channel></rss>',
            200,
            ['Content-Type' => 'application/rss+xml'],
        ),
    ]);

    TickerSetting::current($owner)->update([
        'headline' => 'OBS',
        'ticker_style' => $style,
    ]);
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
        ->assertJsonPath('settings.ticker_style', $style)
        ->assertJsonPath('settings.ticker_style_url', '/ticker-styles/scoreboard.png')
        ->assertJsonPath('settings.ticker_use_image_style', true)
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
        ->and($settings->user_headline)->toBe('Latest text')
        ->and($settings->ticker_style)->toBeNull()
        ->and($settings->ticker_use_image_style)->toBeTrue()
        ->and($settings->moderator_only_submissions)->toBeFalse();
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
    $style = createTickerStyleFixture();
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
            'ticker_style' => $style,
            'ticker_use_image_style' => '0',
            'label_position' => 'right',
            'chroma_key_color' => 'blue',
            'image_url' => 'https://example.com/logo.png',
            'crawl_duration_seconds' => 45,
            'message_display_seconds' => 15,
            'poll_interval_seconds' => 10,
            'moderator_only_submissions' => '1',
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
        ->and($settings->ticker_style)->toBe($style)
        ->and($settings->ticker_use_image_style)->toBeFalse()
        ->and($settings->label_position)->toBe('right')
        ->and($settings->chroma_key_color)->toBe('blue')
        ->and($settings->image_url)->toBe('https://example.com/logo.png')
        ->and($settings->moderator_only_submissions)->toBeTrue()
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

test('user can stitch custom images into a theme directory', function () {
    $user = User::factory()->create();

    $dummyPng = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', true);

    $titleFile = UploadedFile::fake()->createWithContent('title.png', $dummyPng);
    $contentFile = UploadedFile::fake()->createWithContent('content.png', $dummyPng);
    $endFile = UploadedFile::fake()->createWithContent('end.png', $dummyPng);

    $this->actingAs($user)
        ->post(route('ticker.settings.stitch'), [
            'theme_name' => 'Dusk',
            'author_name' => 'Patrik Forsberg',
            'title_image' => $titleFile,
            'content_image' => $contentFile,
            'end_image' => $endFile,
            'custom_label_left' => '0%',
            'custom_label_width' => '13.5%',
            'custom_viewport_left' => '24%',
            'custom_viewport_right' => '10%',
        ])
        ->assertRedirect(route('ticker.themes.index'));

    $settings = TickerSetting::current($user);

    expect($settings->ticker_style)->toBe('dusk.png');
    expect($settings->ticker_use_image_style)->toBeTrue();
    expect($settings->custom_label_left)->toBe('0%');
    expect($settings->custom_label_width)->toBe('13.5%');
    expect($settings->custom_viewport_left)->toBe('24%');
    expect($settings->custom_viewport_right)->toBe('10%');

    expect(File::exists(public_path('ticker-styles/dusk/title.png')))->toBeTrue();
    expect(File::exists(public_path('ticker-styles/dusk/content.png')))->toBeTrue();
    expect(File::exists(public_path('ticker-styles/dusk/end.png')))->toBeTrue();
    expect(File::exists(public_path('ticker-styles/dusk/dusk.json')))->toBeTrue();
    expect(File::exists(public_path('ticker-styles/compiled/dusk.png')))->toBeTrue();
    expect(File::exists(public_path('ticker-styles/compiled/dusk.json')))->toBeTrue();

    $meta = json_decode((string) File::get(public_path('ticker-styles/dusk/dusk.json')), true);
    expect($meta)->toHaveKeys(['name', 'theme_name', 'author', 'created_at', 'custom_label_left', 'custom_label_width', 'custom_viewport_left', 'custom_viewport_right']);

    $this->getJson(route('ticker.payload', ['uuid' => $user->ticker_uuid]))
        ->assertSuccessful()
        ->assertJsonPath('settings.ticker_style', 'dusk.png')
        ->assertJsonPath('settings.ticker_style_url', '/ticker-styles/compiled/dusk.png')
        ->assertJsonPath('settings.ticker_use_image_style', true)
        ->assertJsonPath('settings.custom_label_left', '0%')
        ->assertJsonPath('settings.custom_label_width', '13.5%')
        ->assertJsonPath('settings.custom_viewport_left', '24%')
        ->assertJsonPath('settings.custom_viewport_right', '10%');

    $this->get(route('ticker.themes.index'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('ticker/themes')
            ->where('themes.data', fn (mixed $themes): bool => collect($themes)->contains(fn (array $theme): bool => $theme['slug'] === 'dusk')));
});

test('stitch failures return a validation error instead of a 500', function () {
    $user = User::factory()->create();

    $dummyPng = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQImWNgYGBgAAAABQABF2M8XwAAAABJRU5ErkJggg==', true);

    $titleFile = UploadedFile::fake()->createWithContent('title.png', $dummyPng);
    $contentFile = UploadedFile::fake()->createWithContent('content.png', $dummyPng);
    $endFile = UploadedFile::fake()->createWithContent('end.png', $dummyPng);

    $this->mock(TickerStyleRepository::class, function ($mock): void {
        $mock->shouldReceive('all')->andThrow(new RuntimeException('boom'));
    });

    $this->actingAs($user)
        ->post(route('ticker.settings.stitch'), [
            'theme_name' => 'Dusk',
            'author_name' => 'Patrik Forsberg',
            'title_image' => $titleFile,
            'content_image' => $contentFile,
            'end_image' => $endFile,
        ])
        ->assertRedirect()
        ->assertSessionHasErrors('stitch');
});
