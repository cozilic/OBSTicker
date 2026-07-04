<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Builder;
use App\Models\User;

class RssFeed extends Model
{
    /** @use HasFactory<\Database\Factories\RssFeedFactory> */
    use HasFactory;

    protected $fillable = [
        'name',
        'owner_id',
        'url',
        'is_active',
        'item_limit',
        'refresh_minutes',
        'last_checked_at',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'last_checked_at' => 'datetime',
        ];
    }

    /**
     * @param  Builder<RssFeed>  $query
     * @return Builder<RssFeed>
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    /**
     * @param  Builder<RssFeed>  $query
     * @return Builder<RssFeed>
     */
    public function scopeForOwner(Builder $query, User|int $owner): Builder
    {
        return $query->where('owner_id', $owner instanceof User ? $owner->id : $owner);
    }
}
