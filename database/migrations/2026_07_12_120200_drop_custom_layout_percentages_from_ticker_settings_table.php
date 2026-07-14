<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * WYCIWYG cleanup: the four `custom_label_*` / `custom_viewport_*`
     * columns were per-instance overrides for the live ticker's label and
     * viewport positions. With the show.tsx cascade now deriving those
     * positions directly from each theme's meta.json (cuts + bbox), the
     * columns are vestigial. Drop them so the database schema matches the
     * runtime contract and we stop accepting silent drift between what the
     * dashboard saves and what the live ticker actually renders.
     */
    public function up(): void
    {
        Schema::table('ticker_settings', function (Blueprint $table): void {
            $table->dropColumn([
                'custom_label_left',
                'custom_label_width',
                'custom_viewport_left',
                'custom_viewport_right',
            ]);
        });
    }

    public function down(): void
    {
        Schema::table('ticker_settings', function (Blueprint $table): void {
            $table->string('custom_label_left')->nullable();
            $table->string('custom_label_width')->nullable();
            $table->string('custom_viewport_left')->nullable();
            $table->string('custom_viewport_right')->nullable();
        });
    }
};
