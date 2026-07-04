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
        Schema::create('ticker_messages', function (Blueprint $table) {
            $table->id();
            $table->string('source_type')->default('user')->index();
            $table->string('submitter_name')->nullable();
            $table->string('source_label')->nullable();
            $table->text('content');
            $table->string('status')->default('queued')->index();
            $table->boolean('is_active')->default(true)->index();
            $table->unsignedInteger('sort_order')->default(0)->index();
            $table->timestamp('starts_at')->nullable()->index();
            $table->timestamp('ends_at')->nullable()->index();
            $table->timestamp('playback_started_at')->nullable()->index();
            $table->timestamp('played_at')->nullable()->index();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('ticker_messages');
    }
};
