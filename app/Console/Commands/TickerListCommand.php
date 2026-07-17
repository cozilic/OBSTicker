<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

class TickerListCommand extends Command
{
    /**
     * Tabulates every theme directory on disk so a dev/prod operator
     * can disambiguate which ticker is actually being served without
     * guessing from screenshots alone. Use --slug=<name> to focus
     * on a single theme when the disk has many. The "compiled_mtime"
     * column doubles as a cache-state indicator: if it reads
     * "<missing>" the theme has never been recompiled (still on
     * the first-generation PNG); if it is older than any of the
     * source PNGs in the same row, force a recompile by deleting
     * the compiled PNG (or just bump the cache marker).
     */
    protected $signature = 'ticker:list {--slug= : Restrict the listing to a single theme slug}';

    protected $description = 'List every theme directory on disk with its meta values and the compiled PNG mtime.';

    public function handle(): int
    {
        $baseDir = public_path('ticker-styles');
        $compiledDir = public_path('ticker-styles/compiled');

        if (! is_dir($baseDir)) {
            $this->error("Base ticker-styles directory not found: {$baseDir}");

            return self::FAILURE;
        }

        $slugFilter = $this->option('slug');
        if ($slugFilter === '') {
            // Empty string from `--slug=` (no value) is the same as
            // omitting the flag — surface all themes rather than
            // filtering by an empty name.
            $slugFilter = null;
        }

        $rows = [];
        foreach (scandir($baseDir) ?: [] as $item) {
            if ($item === '.' || $item === '..' || str_starts_with($item, '.')) {
                continue;
            }

            $themeDir = "{$baseDir}/{$item}";
            if (! is_dir($themeDir)) {
                continue;
            }

            if ($slugFilter !== null && $slugFilter !== $item) {
                continue;
            }

            $sourceJson = "{$themeDir}/{$item}.json";
            if (! is_file($sourceJson)) {
                $this->warn("Theme slug '{$item}' has no source meta JSON; skipping.");

                continue;
            }

            $meta = json_decode((string) file_get_contents($sourceJson), true);
            if (! is_array($meta)) {
                $this->warn("Theme '{$item}' source meta is malformed; skipping.");

                continue;
            }

            $partsStatus = $this->partsStatus(
                "{$themeDir}/title.png",
                "{$themeDir}/content.png",
                "{$themeDir}/end.png",
            );

            $compiledPng = "{$compiledDir}/{$item}.png";
            $compiledMtime = is_file($compiledPng)
                ? date('Y-m-d H:i:s', (int) filemtime($compiledPng))
                : '<missing>';

            $rows[] = [
                'slug' => $item,
                'left_pct' => $this->asFloat($meta['left_pct'] ?? null),
                'right_pct' => $this->asFloat($meta['right_pct'] ?? null),
                'split_1' => $this->asFloat($meta['split_1'] ?? null),
                'split_2' => $this->asFloat($meta['split_2'] ?? null),
                'dyn_stretch' => $this->asBool($meta['dynamic_content_stretch'] ?? null),
                'parts' => $partsStatus,
                'compiled_mtime' => $compiledMtime,
            ];
        }

        usort($rows, static fn (array $a, array $b): int => $a['slug'] <=> $b['slug']);

        if ($rows === []) {
            $suffix = $slugFilter !== null ? " matching slug '{$slugFilter}'" : '';
            $this->info("No themes on disk{$suffix}.");

            return self::SUCCESS;
        }

        $this->table(
            ['slug', 'left_pct', 'right_pct', 'split_1', 'split_2', 'dyn_stretch', 'parts', 'compiled_mtime'],
            $rows,
        );

        return self::SUCCESS;
    }

    /**
     * @return string 'ok' when all three parts exist, otherwise a
     *                short missing-list (e.g. 'title+end').
     */
    private function partsStatus(string $title, string $content, string $end): string
    {
        $labels = ['title', 'content', 'end'];
        $present = [$this->isPng($title), $this->isPng($content), $this->isPng($end)];

        if ($present === [true, true, true]) {
            return 'ok';
        }

        $missing = [];
        foreach ($present as $i => $ok) {
            if (! $ok) {
                $missing[] = $labels[$i];
            }
        }

        return implode('+', $missing);
    }

    private function isPng(string $path): bool
    {
        return is_file($path) && str_ends_with(strtolower($path), '.png');
    }

    private function asFloat(mixed $value): string
    {
        if ($value === null) {
            return '—';
        }

        return rtrim(rtrim(sprintf('%.4F', (float) $value), '0'), '.');
    }

    private function asBool(mixed $value): string
    {
        return ((bool) $value) ? 'true' : 'false';
    }
}
