<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('theme_submissions', function (Blueprint $table): void {
            // The slug is no longer globally unique: rejected submissions need to
            // remain so the original row is preserved, and a fresh submission can
            // re-use the same theme name once the previous one is rejected.
            $table->dropUnique(['theme_slug']);
            $table->index('theme_slug');

            $table->foreignId('published_theme_id')
                ->nullable()
                ->after('archive_path')
                ->constrained('published_themes')
                ->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('theme_submissions', function (Blueprint $table): void {
            $table->dropForeign(['published_theme_id']);
            $table->dropColumn('published_theme_id');

            $table->dropIndex(['theme_slug']);
            $table->unique('theme_slug');
        });
    }
};
