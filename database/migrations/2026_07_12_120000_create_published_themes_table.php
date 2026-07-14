<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The `published_themes` table is the canonical index of approved theme
 * submissions. The flow is two-track:
 *
 *   1. `theme_submissions` (private): any upload from the public submission
 *      form lands here as a `pending` row, plus its ZIP archive. Nothing is
 *      written to the catalog yet, so submissions stay invisible.
 *   2. `published_themes` (public): when an admin approves a submission, a
 *      row is created here as a snapshot of the approved theme metadata.
 *      The matching assets are also extracted to `public/ticker-styles/{slug}/`
 *      by `TickerStyleRepository::importThemeZip()` so the OBS browser source
 *      can fetch them.
 *
 * Keeping the two tables separate makes the lifecycle clearer (rejected
 * submissions stay around for moderation history; a published theme can be
 * removed even when the original submission row is preserved).
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('published_themes', function (Blueprint $table) {
            $table->id();
            // `theme_slug` is the canonical/normalized theme name (matches the
            // filesystem directory under `public/ticker-styles/{slug}/`).
            $table->string('theme_slug')->unique();
            // `theme_name` mirrors `theme_slug` after importer normalization; the
            // importer slugifies the ZIP's JSON `theme_name` so we store the
            // same canonical value here for queryability.
            $table->string('theme_name');
            // `theme_label` is the human-readable display name from the ZIP JSON
            // `name` field (or the slug headlined as a fallback).
            $table->string('theme_label');
            $table->string('author_name')->nullable();
            $table->foreignId('original_submission_id')
                ->nullable()
                ->constrained('theme_submissions')
                ->nullOnDelete();
            $table->foreignId('approved_by_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('published_themes');
    }
};
