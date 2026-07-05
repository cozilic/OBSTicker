<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TickerSetting extends Model
{
    protected $fillable = [
        'headline',
        'owner_id',
        'rss_headline',
        'user_headline',
        'background_color',
        'text_color',
        'accent_color',
        'canvas_width',
        'canvas_height',
        'animation_style',
        'animation_duration_seconds',
        'animation_out_duration_seconds',
        'shape_style',
        'label_position',
        'chroma_key_color',
        'image_url',
        'crawl_duration_seconds',
        'message_display_seconds',
        'poll_interval_seconds',
        'show_rss',
    ];

    protected $attributes = [
        'headline' => 'Latest news',
        'rss_headline' => 'Latest news',
        'user_headline' => 'Latest text',
        'background_color' => '#111827',
        'text_color' => '#ffffff',
        'accent_color' => '#38bdf8',
        'canvas_width' => 1920,
        'canvas_height' => 1080,
        'animation_style' => 'slide-left',
        'animation_duration_seconds' => 1,
        'animation_out_duration_seconds' => 1,
        'shape_style' => 'bar',
        'label_position' => 'left',
        'chroma_key_color' => 'green',
        'crawl_duration_seconds' => 35,
        'message_display_seconds' => 18,
        'poll_interval_seconds' => 15,
        'show_rss' => true,
    ];

    protected function casts(): array
    {
        return [
            'canvas_width' => 'integer',
            'canvas_height' => 'integer',
            'animation_duration_seconds' => 'integer',
            'animation_out_duration_seconds' => 'integer',
            'crawl_duration_seconds' => 'integer',
            'message_display_seconds' => 'integer',
            'poll_interval_seconds' => 'integer',
            'show_rss' => 'boolean',
        ];
    }

    public static function current(?User $owner = null): self
    {
        if ($owner === null) {
            return self::query()->firstOrCreate(['id' => 1], self::defaultAttributes());
        }

        return self::query()->firstOrCreate(['owner_id' => $owner->id], self::defaultAttributes());
    }

    /**
     * @return array<string, mixed>
     */
    public static function defaultAttributes(): array
    {
        return [
            'headline' => 'Latest news',
            'rss_headline' => 'Latest news',
            'user_headline' => 'Latest text',
            'background_color' => '#111827',
            'text_color' => '#ffffff',
            'accent_color' => '#38bdf8',
            'canvas_width' => 1920,
            'canvas_height' => 1080,
            'animation_style' => 'slide-left',
            'animation_duration_seconds' => 1,
            'animation_out_duration_seconds' => 1,
            'shape_style' => 'bar',
            'label_position' => 'left',
            'chroma_key_color' => 'green',
            'crawl_duration_seconds' => 35,
            'message_display_seconds' => 18,
            'poll_interval_seconds' => 15,
            'show_rss' => true,
        ];
    }
}
