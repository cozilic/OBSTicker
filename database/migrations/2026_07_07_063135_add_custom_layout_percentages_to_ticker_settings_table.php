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
            $table->string('custom_label_left')->nullable();
            $table->string('custom_label_width')->nullable();
            $table->string('custom_viewport_left')->nullable();
            $table->string('custom_viewport_right')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('ticker_settings', function (Blueprint $table) {
            $table->dropColumn([
                'custom_label_left',
                'custom_label_width',
                'custom_viewport_left',
                'custom_viewport_right',
            ]);
        });
    }
};
