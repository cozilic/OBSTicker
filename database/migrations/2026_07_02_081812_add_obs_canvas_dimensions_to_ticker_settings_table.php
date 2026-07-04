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
            $table->unsignedSmallInteger('canvas_width')->default(1920)->after('accent_color');
            $table->unsignedSmallInteger('canvas_height')->default(1080)->after('canvas_width');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('ticker_settings', function (Blueprint $table) {
            $table->dropColumn([
                'canvas_width',
                'canvas_height',
            ]);
        });
    }
};
