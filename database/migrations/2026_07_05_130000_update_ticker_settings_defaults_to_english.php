<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        DB::table('ticker_settings')
            ->where('headline', 'Senaste nytt')
            ->update(['headline' => 'Latest news']);

        DB::table('ticker_settings')
            ->where('rss_headline', 'Senaste nytt')
            ->update(['rss_headline' => 'Latest news']);

        DB::table('ticker_settings')
            ->where('user_headline', 'Senaste text')
            ->update(['user_headline' => 'Latest text']);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::table('ticker_settings')
            ->where('headline', 'Latest news')
            ->update(['headline' => 'Senaste nytt']);

        DB::table('ticker_settings')
            ->where('rss_headline', 'Latest news')
            ->update(['rss_headline' => 'Senaste nytt']);

        DB::table('ticker_settings')
            ->where('user_headline', 'Latest text')
            ->update(['user_headline' => 'Senaste text']);
    }
};
