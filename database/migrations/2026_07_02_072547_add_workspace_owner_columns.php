<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('owner_id')->nullable()->after('role')->constrained('users')->nullOnDelete();
            $table->uuid('ticker_uuid')->nullable()->unique()->after('owner_id');
        });

        foreach (['ticker_messages', 'rss_feeds', 'ticker_settings'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table): void {
                $table->foreignId('owner_id')->nullable()->after('id')->constrained('users')->cascadeOnDelete();
                $table->index('owner_id');
            });
        }

        DB::table('users')
            ->where('role', 'owner')
            ->whereNull('owner_id')
            ->orderBy('id')
            ->eachById(fn (object $user) => DB::table('users')->where('id', $user->id)->update(['owner_id' => $user->id]));

        DB::table('users')
            ->where('role', 'owner')
            ->whereNull('ticker_uuid')
            ->orderBy('id')
            ->eachById(fn (object $user) => DB::table('users')->where('id', $user->id)->update(['ticker_uuid' => (string) Str::uuid()]));

        $firstOwnerId = DB::table('users')->where('role', 'owner')->orderBy('id')->value('id');

        if ($firstOwnerId !== null) {
            foreach (['ticker_messages', 'rss_feeds', 'ticker_settings'] as $tableName) {
                DB::table($tableName)
                    ->whereNull('owner_id')
                    ->update(['owner_id' => $firstOwnerId]);
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        foreach (['ticker_settings', 'rss_feeds', 'ticker_messages'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table): void {
                $table->dropConstrainedForeignId('owner_id');
            });
        }

        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['ticker_uuid']);
            $table->dropColumn('ticker_uuid');
            $table->dropConstrainedForeignId('owner_id');
        });
    }
};
