<?php

use App\Http\Controllers\DashboardController;
use App\Http\Controllers\ModeratorController;
use App\Http\Controllers\PublicTickerController;
use App\Http\Controllers\RssFeedController;
use App\Http\Controllers\SubmitterTwitchAuthController;
use App\Http\Controllers\ThemeSubmissionController;
use App\Http\Controllers\TickerDashboardController;
use App\Http\Controllers\TickerMessageController;
use App\Http\Controllers\TickerSubmissionController;
use App\Http\Controllers\TickerThemeController;
use Illuminate\Support\Facades\Route;

Route::inertia('/', 'welcome')->name('home');

Route::get('ticker', [PublicTickerController::class, 'show'])->name('ticker.show');
Route::get('ticker/payload', [PublicTickerController::class, 'payload'])->name('ticker.payload');
Route::get('submit', [TickerSubmissionController::class, 'create'])->name('ticker.submit');
Route::post('submit', [TickerSubmissionController::class, 'store'])->name('ticker.submissions.store');
Route::get('submit/twitch/redirect', [SubmitterTwitchAuthController::class, 'redirect'])->name('ticker.submitter.twitch.redirect');
Route::get('submit/twitch/callback', [SubmitterTwitchAuthController::class, 'callback'])->name('ticker.submitter.twitch.callback');
Route::get('ticker-admin', TickerDashboardController::class)->name('ticker.dashboard');
Route::get('ticker-admin/theme', [TickerDashboardController::class, 'theme'])->name('ticker.theme');

Route::get('themes', [TickerThemeController::class, 'index'])->name('themes.index');
Route::get('themes/submit', [ThemeSubmissionController::class, 'create'])->name('themes.submit');
Route::post('themes/submissions', [ThemeSubmissionController::class, 'store'])->name('themes.submissions.store');
Route::get('themes/{theme}', [TickerThemeController::class, 'show'])->name('themes.show');

Route::get('ticker-admin/themes', [TickerThemeController::class, 'index'])->name('ticker.themes.index');
Route::get('ticker-admin/themes/{theme}', [TickerThemeController::class, 'show'])->name('ticker.themes.show');
Route::get('ticker-admin/themes/{theme}/share', [TickerThemeController::class, 'share'])->name('ticker.themes.share');
Route::get('ticker-admin/themes/{theme}/share/download', [TickerThemeController::class, 'download'])->name('ticker.themes.share.download');
Route::post('ticker-admin/themes/{theme}/share/url', [TickerThemeController::class, 'generateShareUrl'])->name('ticker.themes.share.url');

Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('dashboard', DashboardController::class)->name('dashboard');
    Route::post('ticker-admin/themes', [TickerThemeController::class, 'store'])->name('ticker.themes.store');
    Route::delete('ticker-admin/themes/{theme}', [TickerThemeController::class, 'destroy'])->name('ticker.themes.destroy');
    Route::get('ticker-admin/theme-submissions', [ThemeSubmissionController::class, 'index'])->name('ticker.theme-submissions.index');
    Route::post('ticker-admin/theme-submissions/{themeSubmission}/approve', [ThemeSubmissionController::class, 'approve'])->name('ticker.theme-submissions.approve');
    Route::post('ticker-admin/theme-submissions/{themeSubmission}/reject', [ThemeSubmissionController::class, 'reject'])->name('ticker.theme-submissions.reject');
    Route::put('ticker-admin/settings', [TickerDashboardController::class, 'update'])->name('ticker.settings.update');
    Route::post('ticker-admin/settings/stitch', [TickerDashboardController::class, 'stitch'])->name('ticker.settings.stitch');
    Route::post('ticker-admin/messages', [TickerMessageController::class, 'store'])->name('ticker.messages.store');
    Route::delete('ticker-admin/messages/{tickerMessage}', [TickerMessageController::class, 'destroy'])->name('ticker.messages.destroy');
    Route::post('ticker-admin/rss-feeds', [RssFeedController::class, 'store'])->name('ticker.rss-feeds.store');
    Route::delete('ticker-admin/rss-feeds/{rssFeed}', [RssFeedController::class, 'destroy'])->name('ticker.rss-feeds.destroy');
    Route::post('ticker-admin/moderators', [ModeratorController::class, 'store'])->name('ticker.moderators.store');
});

require __DIR__.'/settings.php';
