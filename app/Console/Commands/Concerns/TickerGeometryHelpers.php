<?php

namespace App\Console\Commands\Concerns;

use App\Models\TickerSetting;
use App\Models\User;
use App\Services\ThemeImageSlicer;

/**
 * Shared resolution helpers for ticker-artisan commands that need to look
 * up the current workspace owner (for ticker_settings updates) or the
 * canvas width (for ThemeImageSlicer::sliceFromSingle()). Both lookups
 * are best-effort: a missing user falls back silently to default canvas
 * width; an --activate flag path prints an error and surfaces a null so
 * the caller can return a clean FAILURE.
 *
 * Trait methods become private members of the using class, exposed as
 * $this->method() calls — Laravel convention for cross-cutting helpers
 * that multiple artisan commands need identically.
 */
trait TickerGeometryHelpers
{
    /**
     * Pick the first root user (owner_id IS NULL) ordered oldest-first,
     * falling back to any user at all. Used for resolving the workspace
     * whose ticker_settings row holds the canvas_width + the
     * ticker_style pointer.
     */
    private function tryResolveOwner(): ?User
    {
        $owner = User::query()->whereNull('owner_id')->oldest()->first();

        return $owner instanceof User ? $owner : User::query()->oldest()->first();
    }

    /**
     * Same as tryResolveOwner() but the --activate paths expect a clean
     * fail-with-error when there is no user to attribute to. Returns
     * null with the error already printed so the caller can simply
     * `if (! $owner instanceof User) return self::FAILURE;`.
     */
    private function resolveOwnerOrFail(): ?User
    {
        $owner = $this->tryResolveOwner();
        if (! $owner instanceof User) {
            $this->error('No user found in database; refusing to determine workspace owner. Run inside the app or seed a user first.');

            return null;
        }

        return $owner;
    }

    /**
     * Canvas width from TickerSetting for the current workspace,
     * defaulting to {@see ThemeImageSlicer::DEFAULT_CANVAS_WIDTH}
     * when no user / settings row is reachable.
     */
    private function tryResolveCanvasWidth(): int
    {
        $owner = $this->tryResolveOwner();
        if (! $owner instanceof User) {
            return ThemeImageSlicer::DEFAULT_CANVAS_WIDTH;
        }

        $settings = TickerSetting::current($owner);
        $width = (int) ($settings->canvas_width ?? ThemeImageSlicer::DEFAULT_CANVAS_WIDTH);

        return $width > 0 ? $width : ThemeImageSlicer::DEFAULT_CANVAS_WIDTH;
    }
}
