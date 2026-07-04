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
        Schema::table('ticker_settings', function (Blueprint $table) {
            $table->string('rss_headline')->default('Senaste nytt')->after('headline');
            $table->string('user_headline')->default('Senaste text')->after('rss_headline');
            $table->string('animation_style')->default('slide-left')->after('accent_color');
            $table->string('shape_style')->default('bar')->after('animation_style');
            $table->string('image_url')->nullable()->after('shape_style');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('ticker_settings', function (Blueprint $table) {
            $table->dropColumn([
                'rss_headline',
                'user_headline',
                'animation_style',
                'shape_style',
                'image_url',
            ]);
        });
    }
};
