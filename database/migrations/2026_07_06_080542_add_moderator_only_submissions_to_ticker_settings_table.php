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
            $table->boolean('moderator_only_submissions')->default(false)->after('require_auth_to_submit');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('ticker_settings', function (Blueprint $table) {
            $table->dropColumn('moderator_only_submissions');
        });
    }
};
