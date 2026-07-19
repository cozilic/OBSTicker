<?php

namespace App\Services;

/**
 * Geometry-hash recompile cache detection for compiled themes.
 *
 * Replaces the prior `_compiled_under_dynamic_stretch_*_content_*`
 * marker-key string chain (8 accumulated historical suffixes) that the
 * old ThemeImageSlicer::slice() wrote into compiled meta.json under the
 * `if (...) / unset(...)` dance. Each new strategy name required a
 * new marker key, and untoggling the flag carried stale markers across
 * deploys half the time.
 *
 * The new model is: hash every input that affects the compiled PNG
 * output, write that hash into the compiled meta.json on every recompile
 * pass, and compare on the next read. If the hash differs (or the field
 * is absent, which catches any legacy compiled meta from older marker-
 * key strategies) the recompile path rebuilds the PNG.
 *
 * Bump {@see self::VERSION} ONLY when the rendering contract itself
 * changes (not just numbers in the input set). That single version
 * integer invalidates every compiled theme globally — useful when the
 * rewrite of ThemeImageSlicer produces a different pixel result for the
 * same inputs.
 */
class ThemeCacheBuster
{
    /**
     * Rendering contract version. Bump from 1 → 2 when the slicer is
     * rewritten in a way that changes pixel output for identical inputs.
     * Increments invalidate every cached compiled PNG globally.
     */
    public const int VERSION = 1;

    /**
     * Compute a deterministic hash from the geometry/settings that
     * produce the compiled PNG. Identical inputs → identical hash.
     * Rounded to 6 decimals so floating-point reads/writes of the same
     * percentage don't produce different hashes (e.g. 14.000001 stored
     * vs. 14.0 fetched).
     *
     * @param  array<string, mixed>  $settings
     */
    public static function generateHash(array $settings): string
    {
        $payload = [
            'v' => self::VERSION,
            'left_pct' => round((float) ($settings['left_pct'] ?? 0.0), 6),
            'right_pct' => round((float) ($settings['right_pct'] ?? 100.0), 6),
            'split_1' => round((float) ($settings['split_1'] ?? 0.0), 6),
            'split_2' => round((float) ($settings['split_2'] ?? 100.0), 6),
            'top_pct' => round((float) ($settings['top_pct'] ?? 0.0), 6),
            'bottom_pct' => round((float) ($settings['bottom_pct'] ?? 100.0), 6),
            'dynamic' => (bool) ($settings['dynamic_content_stretch'] ?? false),
        ];

        $json = json_encode($payload);

        return md5((string) $json);
    }

    /**
     * Return true when the recompile path should regenerate the PNG.
     * Reads the previously stored hash from compiled meta.json and
     * compares to a freshly computed hash from the user's current
     * settings. Any legacy compiled meta (no `geometry_hash` field)
     * forces a single rebuild.
     *
     * @param  array<string, mixed>  $compiledMeta
     * @param  array<string, mixed>  $settings
     */
    public static function shouldRecompile(array $compiledMeta, array $settings): bool
    {
        $current = self::generateHash($settings);

        return ! isset($compiledMeta['geometry_hash'])
            || ! is_string($compiledMeta['geometry_hash'])
            || $compiledMeta['geometry_hash'] !== $current;
    }
}
