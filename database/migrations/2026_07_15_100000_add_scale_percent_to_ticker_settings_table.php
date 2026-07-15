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
            // Outward-facing display scale percent driven from the
            // ticker-admin "Display scale" slider in
            // resources/js/pages/ticker/dashboard.tsx and applied as a
            // CSS transform: scale(N/100) with transform-origin: center
            // bottom to show.tsx's lower-third shell. Lets the user
            // grow or shrink the ticker inside the OBS canvas without
            // resizing canvas_width / canvas_height themselves (those
            // change the OBS browser-source bounds; this changes how
            // big the ticker appears within those bounds).
            //
            // 100 = baseline (no transform). Allowed 20..200 to match
            // the dashboard.min/max range. unsignedTinyInteger because
            // the value never exceeds 255; default=100 so a fresh row
            // or a ticker_settings row that predates this column reads
            // back as the no-scale baseline before the first save
            // lifts to the user's chosen percent.
            $table->unsignedTinyInteger('scale_percent')->default(100)->after('canvas_height');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('ticker_settings', function (Blueprint $table) {
            $table->dropColumn('scale_percent');
        });
    }
};
