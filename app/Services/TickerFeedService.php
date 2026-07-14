<?php

namespace App\Services;

use App\Models\RssFeed;
use App\Models\TickerMessage;
use App\Models\TickerSetting;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class TickerFeedService
{
    public function __construct(private readonly TickerStyleRepository $tickerStyles) {}

    /**
     * @return array{
     *     settings: array{
     *         headline: string,
     *         rss_headline: string,
     *         user_headline: string,
     *         background_color: string,
     *         text_color: string,
     *         accent_color: string,
     *         canvas_width: int,
     *         canvas_height: int,
     *         animation_style: string,
     *         animation_duration_seconds: int,
     *         animation_out_duration_seconds: int,
     *         shape_style: string,
     *         ticker_style: string|null,
     *         ticker_style_url: string|null,
     *         ticker_use_image_style: bool,
     *         label_position: string,
     *         chroma_key_color: string,
     *         image_url: string|null,
     *         crawl_duration_seconds: int,
     *         message_display_seconds: int,
     *         poll_interval_seconds: int,
     *         show_rss: bool
     *     },
     *     items: array<int, array{type: string, label: string|null, text: string, url: string|null}>
     * }
     */
    public function payload(User $owner): array
    {
        $settings = TickerSetting::current($owner);
        $rssLockKey = $this->rssPlaybackLockKey($owner);

        $currentMessage = $this->currentPlayingMessage($settings, $owner);
        if ($currentMessage) {
            Cache::forget($rssLockKey);

            return [
                'settings' => $this->settingsPayload($settings),
                'items' => [$this->messageItem(
                    $currentMessage->source_label ?? $currentMessage->submitter_name,
                    $currentMessage->content,
                )],
            ];
        }

        $nextMessage = $this->nextQueuedMessage($owner);
        $rssLockUntil = Cache::get($rssLockKey);
        $rssItems = $settings->show_rss ? $this->rssItems($owner, $settings) : [];

        if ($nextMessage) {
            $nextMessage->update([
                'status' => 'playing',
                'playback_started_at' => now(),
            ]);
            Cache::forget($rssLockKey);

            return [
                'settings' => $this->settingsPayload($settings),
                'items' => [$this->messageItem(
                    $nextMessage->source_label ?? $nextMessage->submitter_name,
                    $nextMessage->content,
                )],
            ];
        }

        if ($settings->show_rss && $rssItems !== []) {
            if (! $this->hasActiveRssLock($rssLockUntil)) {
                $rssCycleDuration = max(1, count($rssItems)) * $settings->crawl_duration_seconds;

                Cache::put($rssLockKey, now()->addSeconds($rssCycleDuration), now()->addMinutes(10));
            }

            return [
                'settings' => $this->settingsPayload($settings),
                'items' => $rssItems,
            ];
        }

        return [
            'settings' => $this->settingsPayload($settings),
            'items' => [],
        ];
    }

    /**
     * @return array{
     *     headline: string,
     *     rss_headline: string,
     *     user_headline: string,
     *     background_color: string,
     *     text_color: string,
     *     accent_color: string,
     *     canvas_width: int,
     *     canvas_height: int,
     *     animation_style: string,
     *     animation_duration_seconds: int,
     *     animation_out_duration_seconds: int,
     *     shape_style: string,
     *     ticker_style: string|null,
     *     ticker_style_url: string|null,
     *     ticker_use_image_style: bool,
     *     label_position: string,
     *     chroma_key_color: string,
     *     image_url: string|null,
     *     crawl_duration_seconds: int,
     *     message_display_seconds: int,
     *     poll_interval_seconds: int,
     *     show_rss: bool
     * }
     */
    private function settingsPayload(TickerSetting $settings): array
    {
        return [
            'headline' => $settings->headline,
            'rss_headline' => $settings->rss_headline,
            'user_headline' => $settings->user_headline,
            'background_color' => $settings->background_color,
            'text_color' => $settings->text_color,
            'accent_color' => $settings->accent_color,
            'canvas_width' => $settings->canvas_width,
            'canvas_height' => $settings->canvas_height,
            'animation_style' => $settings->animation_style,
            'animation_duration_seconds' => $settings->animation_duration_seconds,
            'animation_out_duration_seconds' => $settings->animation_out_duration_seconds,
            'shape_style' => $settings->shape_style,
            'ticker_style' => $settings->ticker_style,
            'ticker_style_url' => $this->tickerStyles->url($settings->ticker_style),
            'ticker_use_image_style' => $settings->ticker_use_image_style,
            'label_position' => $settings->label_position,
            'chroma_key_color' => $settings->chroma_key_color,
            'image_url' => $settings->image_url,
            'crawl_duration_seconds' => $settings->crawl_duration_seconds,
            'message_display_seconds' => $settings->message_display_seconds,
            'poll_interval_seconds' => $settings->poll_interval_seconds,
            'show_rss' => $settings->show_rss,
            // WYCIWYG thread: these four custom_label_* / custom_viewport_*
            // strings flow from the legacy 3-file stitch pipeline
            // (TickerDashboardController::handleLegacyStitch) into the
            // live ticker so a theme committed via the legacy builder
            // can position its label + viewport rects without falling
            // back to alpha-aware heuristics on the title/end PNGs.
            // The first-pass source-image build uses meta.json-derived
            // coordinates directly, so these are nullable in that
            // path; the payload shape always carries them so the JS
            // consumer can pick whichever source is present.
            'custom_label_left' => $settings->custom_label_left,
            'custom_label_width' => $settings->custom_label_width,
            'custom_viewport_left' => $settings->custom_viewport_left,
            'custom_viewport_right' => $settings->custom_viewport_right,
        ];
    }

    /**
     * @return array{type: string, label: string|null, text: string, url: string|null}
     */
    private function messageItem(?string $label, string $text): array
    {
        return [
            'type' => 'message',
            'label' => $label,
            'text' => $text,
            'url' => null,
        ];
    }

    /**
     * @return array{
     *     settings: array{
     *         headline: string,
     *         rss_headline: string,
     *         user_headline: string,
     *         background_color: string,
     *         text_color: string,
     *         accent_color: string,
     *         canvas_width: int,
     *         canvas_height: int,
     *         animation_style: string,
     *         animation_duration_seconds: int,
     *         animation_out_duration_seconds: int,
     *         shape_style: string,
     *         ticker_style: string|null,
     *         ticker_style_url: string|null,
     *         ticker_use_image_style: bool,
     *         label_position: string,
     *         chroma_key_color: string,
     *         image_url: string|null,
     *         crawl_duration_seconds: int,
     *         message_display_seconds: int,
     *         poll_interval_seconds: int,
     *         show_rss: bool
     *     },
     *     items: array<int, array{type: string, label: string|null, text: string, url: string|null}>
     * }
     */
    public function emptyPayload(): array
    {
        $settings = new TickerSetting;

        return [
            'settings' => $this->settingsPayload($settings),
            'items' => [],
        ];
    }

    private function currentPlayingMessage(TickerSetting $settings, User $owner): ?TickerMessage
    {
        $playing = TickerMessage::query()
            ->forOwner($owner)
            ->visible()
            ->where('status', 'playing')
            ->oldest('playback_started_at')
            ->first();

        if (
            $playing
            && $playing->playback_started_at?->addSeconds($settings->message_display_seconds)->isFuture()
        ) {
            return $playing;
        }

        if ($playing) {
            $playing->update([
                'status' => 'played',
                'played_at' => now(),
            ]);
        }

        return null;
    }

    private function nextQueuedMessage(User $owner): ?TickerMessage
    {
        return TickerMessage::query()
            ->forOwner($owner)
            ->visible()
            ->where('status', 'queued')
            ->orderBy('sort_order')
            ->oldest()
            ->first();
    }

    private function hasActiveRssLock(mixed $rssLockUntil): bool
    {
        return $rssLockUntil instanceof \DateTimeInterface && now()->isBefore($rssLockUntil);
    }

    private function rssPlaybackLockKey(User $owner): string
    {
        return "ticker:rss-lock:{$owner->id}";
    }

    private function rssRotationStateKey(User $owner): string
    {
        return "ticker:rss-rotation:{$owner->id}";
    }

    /**
     * @return list<array{type: string, label: string, text: string, url: string|null}>
     */
    private function rssItems(User $owner, TickerSetting $settings): array
    {
        $itemsByFeed = RssFeed::query()
            ->forOwner($owner)
            ->active()
            ->oldest('name')
            ->get()
            ->map(fn (RssFeed $feed): array => Cache::remember(
                key: "ticker:rss-feed:{$owner->id}:{$feed->id}",
                ttl: now()->addMinutes($feed->refresh_minutes),
                callback: fn (): array => $this->fetchRssItems($feed),
            ))
            ->all();

        $items = $this->interleaveRssItems(array_values($itemsByFeed));

        return $this->rotateRssItems($owner, $settings, $items);
    }

    /**
     * @param  list<array{type: string, label: string, text: string, url: string|null}>  $items
     * @return list<array{type: string, label: string, text: string, url: string|null}>
     */
    private function rotateRssItems(User $owner, TickerSetting $settings, array $items): array
    {
        if ($items === []) {
            return [];
        }

        $stateKey = $this->rssRotationStateKey($owner);
        $state = Cache::get($stateKey);
        $durationSeconds = max(1, $settings->crawl_duration_seconds);
        $now = now();
        $rotationIndex = 0;
        $updatedAt = $now;

        if (is_array($state) && array_key_exists('index', $state) && array_key_exists('updated_at', $state)) {
            $rotationIndex = max(0, (int) $state['index']) % count($items);
            $updatedAt = Carbon::parse($state['updated_at']);

            $elapsedSeconds = (int) $updatedAt->diffInSeconds($now);

            if ($elapsedSeconds >= $durationSeconds) {
                $advanceBy = intdiv($elapsedSeconds, $durationSeconds);
                $rotationIndex = ($rotationIndex + $advanceBy) % count($items);
                $updatedAt = $updatedAt->addSeconds($advanceBy * $durationSeconds);
            }
        }

        Cache::put($stateKey, [
            'index' => $rotationIndex,
            'updated_at' => $updatedAt->toIso8601String(),
        ], now()->addMinutes(10));

        return [...array_slice($items, $rotationIndex), ...array_slice($items, 0, $rotationIndex)];
    }

    /**
     * @param  list<list<array{type: string, label: string, text: string, url: string|null}>>  $itemsByFeed
     * @return list<array{type: string, label: string, text: string, url: string|null}>
     */
    private function interleaveRssItems(array $itemsByFeed): array
    {
        $merged = [];
        $maxItems = 0;

        foreach ($itemsByFeed as $items) {
            $maxItems = max($maxItems, count($items));
        }

        for ($index = 0; $index < $maxItems; $index++) {
            foreach ($itemsByFeed as $items) {
                if (isset($items[$index])) {
                    $merged[] = $items[$index];
                }
            }
        }

        return $merged;
    }

    /**
     * @return list<array{type: string, label: string, text: string, url: string|null}>
     */
    private function fetchRssItems(RssFeed $feed): array
    {
        $response = Http::timeout(5)
            ->connectTimeout(3)
            ->retry(2, 200)
            ->get($feed->url);

        if (! $response->successful()) {
            return [];
        }

        $feed->forceFill(['last_checked_at' => now()])->save();

        return $this->parseRss($response->body(), $feed);
    }

    /**
     * @return list<array{type: string, label: string, text: string, url: string|null}>
     */
    private function parseRss(string $xml, RssFeed $feed): array
    {
        $previous = libxml_use_internal_errors(true);
        $document = simplexml_load_string($xml, 'SimpleXMLElement', LIBXML_NOCDATA);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        if ($document === false) {
            return [];
        }

        $entries = $document->channel->item ?? $document->entry ?? [];
        $items = [];

        foreach ($entries as $entry) {
            $title = trim((string) ($entry->title ?? ''));

            if ($title === '') {
                continue;
            }

            $items[] = [
                'type' => 'rss',
                'label' => $feed->name,
                'text' => Str::limit(html_entity_decode(strip_tags($title)), 180),
                'url' => $this->entryUrl($entry),
            ];

            if (count($items) >= $feed->item_limit) {
                break;
            }
        }

        return $items;
    }

    private function entryUrl(mixed $entry): ?string
    {
        $link = trim((string) ($entry->link ?? ''));

        if ($link !== '') {
            return $link;
        }

        $attributes = $entry->link->attributes();
        $href = trim((string) ($attributes->href ?? ''));

        return $href !== '' ? $href : null;
    }
}
