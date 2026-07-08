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
        Schema::create('theme_submissions', function (Blueprint $table) {
            $table->id();
            $table->string('theme_name');
            $table->string('theme_slug')->unique();
            $table->string('author_name');
            $table->string('submitter_name')->nullable();
            $table->string('submitter_email')->nullable();
            $table->string('source_type');
            $table->text('source_url')->nullable();
            $table->string('archive_path');
            $table->string('status')->default('pending');
            $table->text('notes')->nullable();
            $table->foreignId('reviewed_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamp('published_at')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->string('published_theme_slug')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('theme_submissions');
    }
};
