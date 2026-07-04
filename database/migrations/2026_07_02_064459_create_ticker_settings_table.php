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
        Schema::create('ticker_settings', function (Blueprint $table) {
            $table->id();
            $table->string('headline')->default('Senaste nytt');
            $table->string('background_color')->default('#111827');
            $table->string('text_color')->default('#ffffff');
            $table->string('accent_color')->default('#38bdf8');
            $table->unsignedSmallInteger('crawl_duration_seconds')->default(35);
            $table->unsignedSmallInteger('message_display_seconds')->default(18);
            $table->unsignedTinyInteger('poll_interval_seconds')->default(15);
            $table->boolean('show_rss')->default(true);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('ticker_settings');
    }
};
