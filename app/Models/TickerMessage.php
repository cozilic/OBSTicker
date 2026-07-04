<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Builder;
use App\Models\User;

class TickerMessage extends Model
{
    /** @use HasFactory<\Database\Factories\TickerMessageFactory> */
    use HasFactory;

    protected $fillable = [
        'source_type',
        'owner_id',
        'submitter_name',
        'source_label',
        'content',
        'status',
        'is_active',
        'sort_order',
        'starts_at',
        'ends_at',
        'playback_started_at',
        'played_at',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'playback_started_at' => 'datetime',
            'played_at' => 'datetime',
        ];
    }

    /**
     * @param  Builder<TickerMessage>  $query
     * @return Builder<TickerMessage>
     */
    public function scopeVisible(Builder $query): Builder
    {
        return $query
            ->where('is_active', true)
            ->where(function (Builder $query): void {
                $query->whereNull('starts_at')->orWhere('starts_at', '<=', now());
            })
            ->where(function (Builder $query): void {
                $query->whereNull('ends_at')->orWhere('ends_at', '>=', now());
            });
    }

    /**
     * @param  Builder<TickerMessage>  $query
     * @return Builder<TickerMessage>
     */
    public function scopeUnplayed(Builder $query): Builder
    {
        return $query->whereIn('status', ['queued', 'playing']);
    }

    /**
     * @param  Builder<TickerMessage>  $query
     * @return Builder<TickerMessage>
     */
    public function scopeForOwner(Builder $query, User|int $owner): Builder
    {
        return $query->where('owner_id', $owner instanceof User ? $owner->id : $owner);
    }
}
