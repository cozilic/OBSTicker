<?php

namespace App\Models;

use Database\Factories\RssFeedFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property int $owner_id
 * @property Carbon|null $last_checked_at
 */
class RssFeed extends Model
{
    /** @use HasFactory<RssFeedFactory> */
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
