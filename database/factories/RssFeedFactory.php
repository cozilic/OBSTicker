<?php

namespace Database\Factories;

use App\Models\RssFeed;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<RssFeed>
 */
class RssFeedFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->company(),
            'owner_id' => User::factory(),
            'url' => fake()->url(),
            'is_active' => true,
            'item_limit' => 5,
            'refresh_minutes' => 15,
            'last_checked_at' => null,
        ];
    }
}
