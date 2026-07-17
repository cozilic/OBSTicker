<?php

namespace App\Console\Commands;

use App\Console\Commands\Concerns\TickerGeometryHelpers;
use App\Models\TickerSetting;
use App\Models\User;
use App\Services\ThemeImageSlicer;
use App\Services\TickerStyleRepository;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Throwable;

/**
 * Re-slice an existing ticker theme from a fresh source PNG using the
 * geometry already persisted in public/ticker-styles/{slug}/{slug}.json
 * (left_pct, right_pct, split_1, split_2, top_pct, bottom_pct,
 * dynamic_content_stretch). Calls ThemeImageSlicer::sliceFromSingle() which
 * overwrites title.png, content.png, end.png in the theme directory and
 * emits a fresh compiled PNG via the in-process
 * TickerStyleRepository::all() recompile trigger.
 *
 * Useful when iterating on source artwork without re-typing every geometry
 * argument to ticker:create. Mirrors the controller slice flow but reads
 * bbox + splits from disk rather than from CLI args.
 *
 * Usage:
 *
 *   php artisan ticker:reslice green-dusk --source=storage/app/private/v2.png
 *
 *   php artisan ticker:reslice green-dusk --source=storage/app/private/v2.png --activate
 */
class TickerResliceCommand extends Command
{
    use TickerGeometryHelpers;

    protected $signature = 'ticker:reslice
        {slug : Existing theme slug whose meta.json holds the geometry}
        {--source= : Source PNG to re-cut (REQUIRED)}
        {--activate : Set the re-sliced theme as the active ticker_style}
        {--author= : Update the author display name in meta.json (default: keep existing)}';

    protected $description = 'Re-slice an existing ticker theme from a fresh source PNG using its on-disk meta.json geometry. Writes title/content/end.png + recompiles.';

    public function handle(
        ThemeImageSlicer $themeImageSlicer,
        TickerStyleRepository $tickerStyles,
    ): int {
        $rawSlug = trim((string) $this->argument('slug'));
        $themeSlug = Str::slug($rawSlug);
        if ($themeSlug === '') {
            $this->error('Theme slug must contain at least one letter or number.');

            return self::FAILURE;
        }

        $themeDir = public_path('ticker-styles/'.$themeSlug);
        $themeJson = $themeDir.'/'.$themeSlug.'.json';

        if (! is_dir($themeDir) || ! is_file($themeJson)) {
            $this->error(sprintf('Theme not found on disk: %s', $themeDir));
            $this->line('  (Run php artisan ticker:create first, or use ticker:create --source=<path> for new themes.)');

            return self::FAILURE;
        }

        $sourcePath = $this->option('source');
        if (! is_string($sourcePath) || $sourcePath === '' || ! is_file($sourcePath)) {
            $this->error(sprintf('--source= must point to an existing PNG file (got: %s)', $sourcePath ?? '<null>'));

            return self::FAILURE;
        }

        $meta = json_decode((string) file_get_contents($themeJson), true);
        if (! is_array($meta)) {
            $this->error(sprintf('Theme meta.json is malformed JSON: %s', $themeJson));

            return self::FAILURE;
        }

        $missing = [];
        foreach (['split_1', 'split_2', 'left_pct', 'right_pct'] as $key) {
            if (! isset($meta[$key]) || ! is_numeric($meta[$key])) {
                $missing[] = $key;
            }
        }
        if ($missing !== []) {
            $this->error(sprintf('meta.json is missing required numeric keys: %s', implode(', ', $missing)));

            return self::FAILURE;
        }

        $split1 = (float) $meta['split_1'];
        $split2 = (float) $meta['split_2'];
        $leftPct = (float) $meta['left_pct'];
        $rightPct = (float) $meta['right_pct'];
        $topPct = (float) ($meta['top_pct'] ?? 0.0);
        $bottomPct = (float) ($meta['bottom_pct'] ?? 100.0);
        $dyn = (bool) ($meta['dynamic_content_stretch'] ?? false);

        // Mirror controller runtime override: dyn=true -> hard-clamp split_2 to right_pct.
        if ($dyn) {
            $split2 = $rightPct;
        }

        $canvasWidth = $this->tryResolveCanvasWidth();

        try {
            $sliceMetrics = $themeImageSlicer->sliceFromSingle(
                $sourcePath,
                $split1,
                $split2,
                $themeDir,
                $canvasWidth,
                returnPreview: false,
                topPct: $topPct,
                bottomPct: $bottomPct,
                leftPct: $leftPct,
                rightPct: $rightPct,
                dynamicContentStretch: $dyn,
            );
        } catch (Throwable $exception) {
            $this->cleanupPartialSlice($themeDir);
            throw $exception;
        }

        if (! is_array($sliceMetrics)) {
            $this->cleanupPartialSlice($themeDir);
            $this->error('Slice failed for the source image (slicer returned false).');

            return self::FAILURE;
        }

        $persistedMetrics = array_intersect_key(
            $sliceMetrics,
            array_flip([
                'title_stamp_left_pct',
                'title_stamp_width_pct',
                'end_stamp_left_pct',
                'end_stamp_width_pct',
            ]),
        );

        $newMeta = array_merge($meta, $persistedMetrics);
        $newAuthor = $this->option('author');
        if (is_string($newAuthor) && $newAuthor !== '') {
            $newMeta['author'] = trim($newAuthor);
        }
        $newMeta['updated_at'] = now()->toDateTimeString();

        File::put(
            $themeJson,
            (string) json_encode($newMeta, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES).PHP_EOL,
        );

        $tickerStyles->all();

        $this->info(sprintf('Theme \'%s\' re-sliced from %s', $themeSlug, $sourcePath));
        $this->line(sprintf('  geometry (from meta.json): top=%s%% bottom=%s%% left=%s%% right=%s%%', $topPct, $bottomPct, $leftPct, $rightPct));
        $this->line(sprintf('  splits: split1=%s%% split2=%s%% dyn=%s', $split1, $split2, $dyn ? 'true' : 'false'));
        $this->line('  stamp metrics: '.json_encode($persistedMetrics));
        $this->line('  output: public/ticker-styles/'.$themeSlug.'/{title,content,end}.png + compiled/'.$themeSlug.'.{png,json}');

        if ($this->option('activate')) {
            $owner = $this->resolveOwnerOrFail();
            if (! $owner instanceof User) {
                return self::FAILURE;
            }
            $settings = TickerSetting::current($owner);
            $settings->update([
                'ticker_style' => $themeSlug.'.png',
                'ticker_use_image_style' => true,
            ]);
            $this->info(sprintf('Activated: ticker_style=%s.png (workspace owner id=%s)', $themeSlug, $owner->id));
        } else {
            $this->line('  (Pass --activate to also set ticker_style on the active workspace.)');
        }

        $this->line('Verify with: php artisan ticker:list --slug='.$themeSlug);

        return self::SUCCESS;
    }

    /**
     * Best-effort: remove only the freshly-written slice outputs (title.png /
     * content.png / end.png). meta.json is preserved so the user can re-run
     * the command with a corrected --source without re-creating the theme.
     */
    private function cleanupPartialSlice(string $themeDir): void
    {
        foreach (['title.png', 'content.png', 'end.png'] as $part) {
            $path = $themeDir.'/'.$part;
            if (is_file($path)) {
                @unlink($path);
            }
        }
        $this->warn(sprintf('Cleaned up partial slice output at %s (meta.json preserved).', $themeDir));
    }
}
