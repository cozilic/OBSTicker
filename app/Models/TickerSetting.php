<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * @property string|null $ticker_style
 * @property bool $ticker_use_image_style
 */
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
        'ticker_style',
        'ticker_use_image_style',
        'label_position',
        'chroma_key_color',
        'image_url',
        'crawl_duration_seconds',
        'message_display_seconds',
        'poll_interval_seconds',
        'require_auth_to_submit',
        'moderator_only_submissions',
        'show_rss',
        'custom_label_left',
        'custom_label_width',
        'custom_viewport_left',
        'custom_viewport_right',
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
        'ticker_style' => null,
        'ticker_use_image_style' => true,
        'label_position' => 'left',
        'chroma_key_color' => 'green',
        'crawl_duration_seconds' => 35,
        'message_display_seconds' => 18,
        'poll_interval_seconds' => 15,
        'require_auth_to_submit' => false,
        'moderator_only_submissions' => false,
        'show_rss' => true,
    ];

    protected function casts(): array
    {
        return [
            'canvas_width' => 'integer',
            'canvas_height' => 'integer',
            'animation_duration_seconds' => 'integer',
            'animation_out_duration_seconds' => 'integer',
            'ticker_use_image_style' => 'boolean',
            'crawl_duration_seconds' => 'integer',
            'message_display_seconds' => 'integer',
            'poll_interval_seconds' => 'integer',
            'require_auth_to_submit' => 'boolean',
            'moderator_only_submissions' => 'boolean',
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
            'ticker_style' => null,
            'ticker_use_image_style' => true,
            'label_position' => 'left',
            'chroma_key_color' => 'green',
            'crawl_duration_seconds' => 35,
            'message_display_seconds' => 18,
            'poll_interval_seconds' => 15,
            'require_auth_to_submit' => false,
            'moderator_only_submissions' => false,
            'show_rss' => true,
        ];
    }
}
