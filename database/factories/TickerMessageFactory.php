<?php

namespace Database\Factories;

use App\Models\TickerMessage;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<TickerMessage>
 */
class TickerMessageFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'source_type' => 'user',
            'owner_id' => User::factory(),
            'submitter_name' => fake()->name(),
            'source_label' => fake()->optional()->word(),
            'content' => fake()->sentence(),
            'status' => 'queued',
            'is_active' => true,
            'sort_order' => fake()->numberBetween(0, 20),
            'starts_at' => null,
            'ends_at' => null,
            'playback_started_at' => null,
            'played_at' => null,
        ];
    }
}
