<?php

use App\Http\Controllers\DashboardController;
use App\Http\Controllers\ModeratorController;
use App\Http\Controllers\PublicTickerController;
use App\Http\Controllers\RssFeedController;
use App\Http\Controllers\SubmitterTwitchAuthController;
use App\Http\Controllers\TickerDashboardController;
use App\Http\Controllers\TickerMessageController;
use App\Http\Controllers\TickerSubmissionController;
use Illuminate\Support\Facades\Route;

Route::inertia('/', 'welcome')->name('home');

Route::get('ticker', [PublicTickerController::class, 'show'])->name('ticker.show');
Route::get('ticker/payload', [PublicTickerController::class, 'payload'])->name('ticker.payload');
Route::get('submit', [TickerSubmissionController::class, 'create'])->name('ticker.submit');
Route::post('submit', [TickerSubmissionController::class, 'store'])->name('ticker.submissions.store');
Route::get('submit/twitch/redirect', [SubmitterTwitchAuthController::class, 'redirect'])->name('ticker.submitter.twitch.redirect');
Route::get('submit/twitch/callback', [SubmitterTwitchAuthController::class, 'callback'])->name('ticker.submitter.twitch.callback');
Route::get('ticker-admin', TickerDashboardController::class)->name('ticker.dashboard');

Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('dashboard', DashboardController::class)->name('dashboard');
    Route::put('ticker-admin/settings', [TickerDashboardController::class, 'update'])->name('ticker.settings.update');
    Route::post('ticker-admin/messages', [TickerMessageController::class, 'store'])->name('ticker.messages.store');
    Route::delete('ticker-admin/messages/{tickerMessage}', [TickerMessageController::class, 'destroy'])->name('ticker.messages.destroy');
    Route::post('ticker-admin/rss-feeds', [RssFeedController::class, 'store'])->name('ticker.rss-feeds.store');
    Route::delete('ticker-admin/rss-feeds/{rssFeed}', [RssFeedController::class, 'destroy'])->name('ticker.rss-feeds.destroy');
    Route::post('ticker-admin/moderators', [ModeratorController::class, 'store'])->name('ticker.moderators.store');
});

require __DIR__.'/settings.php';
