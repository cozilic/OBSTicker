<?php

namespace App\Console\Commands;

use App\Console\Commands\Concerns\TickerGeometryHelpers;
use App\Http\Controllers\TickerDashboardController;
use App\Models\TickerSetting;
use App\Models\User;
use App\Services\ThemeImageSlicer;
use App\Services\TickerStyleRepository;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Throwable;

/**
 * Create a ticker theme on disk from the CLI, mirroring the controller flow
 * that {@see TickerDashboardController::slice()} drives
 * in the theme builder UI. Two input modes are supported:
 *
 *   --source=<png>      Single-image flow. Calls ThemeImageSlicer::sliceFromSingle()
 *                       which bbox-crops and splits the source into
 *                       title/content/end.png under public/ticker-styles/{slug}/.
 *
 *   --from-theme=<slug> Three-file copy flow. Copies an existing theme's
 *                       title/content/end.png into the new directory and
 *                       recomputes slot metrics against the requested
 *                       geometry so the meta.json reflects the new
 *                       bounding box + split percentages without re-uploading.
 *
 * Both flows persist meta.json, force the in-process recompile via
 * TickerStyleRepository::all(), and optionally activate the new theme
 * via {@see --activate}.
 *
 * Useful tests this enables without UI friction:
 *
 *   php artisan ticker:create green-dusk \
 *     --from-theme=test --left=53.3 --right=96.6 \
 *     --split1=67.4 --split2=93.8 --dyn --activate
 *
 *   php artisan ticker:create bespoke \
 *     --source=storage/app/sample.png \
 *     --split1=25 --split2=75 --dyn
 */
class TickerCreateCommand extends Command
{
    use TickerGeometryHelpers;

    protected $signature = 'ticker:create
        {slug : Theme slug (will be normalized via Str::slug; underscores and spaces become hyphens)}
        {--source= : Single PNG source \u2014 runs sliceFromSingle() with the given bbox/splits}
        {--from-theme= : Existing theme slug to copy title/content/end.png from}
        {--title= : Override title.png when --from-theme is used (path to a PNG)}
        {--content= : Override content.png when --from-theme is used (path to a PNG)}
        {--end= : Override end.png when --from-theme is used (path to a PNG)}
        {--split1= : Left split percentage (REQUIRED; must satisfy --left+1% < split1)}
        {--split2= : Right split percentage (REQUIRED; must satisfy split1+1% < split2 unless --dyn)}
        {--top= : Top bbox percent (default 0)}
        {--bottom= : Bottom bbox percent (default 100)}
        {--left= : Left bbox percent (default 0)}
        {--right= : Right bbox percent (default 100)}
        {--label-left= : Label box left percent (default = --left)}
        {--label-width= : Label box width percent (default = split1 - left)}
        {--label-top= : Label box top percent (default = --top)}
        {--label-height= : Label box height percent (default = bottom - top)}
        {--dyn : Enable dynamic_content_stretch (right-pinned content; end-slot collapses)}
        {--author= : Author display name (default: shell $USER or "CLI")}
        {--activate : Set the new theme as the active ticker_style on the workspace}
        {--overwrite : Replace an existing theme directory with the same slug}';

    protected $description = 'Create a ticker theme on disk (single-source or copy from existing) and optionally activate it. Mirrors the theme-builder save flow.';

    private const SLIDER_GAP_PERCENT = 1.0;

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

        $themeName = $rawSlug !== '' ? $rawSlug : $themeSlug;

        $authorName = trim($this->option('author') ?? '');
        if ($authorName === '') {
            $shellUser = getenv('USER') ?: getenv('USERNAME');
            $authorName = (is_string($shellUser) && trim($shellUser) !== '') ? trim($shellUser) : 'CLI';
        }

        $mode = $this->detectInputMode();
        if ($mode === null) {
            $this->error('Provide exactly one of: --source=<png> (single-image flow) OR --from-theme=<slug> (copy flow).');

            return self::FAILURE;
        }

        // Geometry parsing \u2014 required options return null instead of throwing
        // so handle() can return a clean FAILURE without leaking a stacktrace
        // to artisan on user input errors.
        $topPct = $this->pctOption('top', 0.0);
        $bottomPct = $this->pctOption('bottom', 100.0);
        $leftPct = $this->pctOption('left', 0.0);
        $rightPct = $this->pctOption('right', 100.0);
        $split1 = $this->requiredPctOption('split1');
        $split2 = $this->requiredPctOption('split2');
        if ($split1 === null || $split2 === null) {
            return self::FAILURE;
        }
        $labelLeft = $this->pctOption('label-left', $leftPct);
        $labelWidth = $this->pctOption('label-width', max(0.01, $split1 - $leftPct));
        $labelTop = $this->pctOption('label-top', $topPct);
        $labelHeight = $this->pctOption('label-height', max(0.01, $bottomPct - $topPct));
        $dyn = (bool) $this->option('dyn');

        $geometryErrors = $this->validateGeometry(
            $topPct, $bottomPct, $leftPct, $rightPct, $split1, $split2, $dyn,
        );
        if ($geometryErrors !== []) {
            foreach ($geometryErrors as $msg) {
                $this->error($msg);
            }

            return self::FAILURE;
        }

        // Mirror controller: when dyn is on, hard-clamp split2 to right_pct so
        // the slicer never sees an artist-dragged value riding the boundary.
        if ($dyn) {
            $split2 = $rightPct;
        }

        $themeDir = public_path("ticker-styles/{$themeSlug}");
        $themeJson = $themeDir.'/'.$themeSlug.'.json';
        if (is_dir($themeDir) && ! $this->option('overwrite')) {
            $this->error("Theme directory already exists: {$themeDir} (pass --overwrite to replace).");

            return self::FAILURE;
        }

        File::ensureDirectoryExists($themeDir);

        $canvasWidth = $this->tryResolveCanvasWidth();

        if ($mode === 'source') {
            $sliceMetrics = $this->runSingleSourceFlow(
                $themeImageSlicer, $themeDir, $canvasWidth,
                $split1, $split2, $topPct, $bottomPct, $leftPct, $rightPct, $dyn,
            );
            if ($sliceMetrics === null) {
                $this->cleanupPartialTheme($themeDir);

                return self::FAILURE;
            }
        } else {
            try {
                $sliceMetrics = $this->runCopyFlow(
                    $themeImageSlicer, $themeDir, $canvasWidth,
                    $split1, $split2, $leftPct, $rightPct, $dyn,
                );
            } catch (Throwable $exception) {
                $this->cleanupPartialTheme($themeDir);
                throw $exception;
            }

            if ($sliceMetrics === null) {
                $this->cleanupPartialTheme($themeDir);

                return self::FAILURE;
            }
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

        $meta = array_merge([
            'name' => $themeName,
            'theme_name' => $themeSlug,
            'author' => $authorName,
            'created_at' => now()->toDateTimeString(),
            'split_1' => $split1,
            'split_2' => $split2,
            'top_pct' => $topPct,
            'bottom_pct' => $bottomPct,
            'left_pct' => $leftPct,
            'right_pct' => $rightPct,
            'label_left_pct' => $labelLeft,
            'label_width_pct' => $labelWidth,
            'label_top_pct' => $labelTop,
            'label_height_pct' => $labelHeight,
            'dynamic_content_stretch' => $dyn,
        ], $persistedMetrics);

        File::put(
            $themeJson,
            (string) json_encode($meta, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES).PHP_EOL,
        );

        // Force in-process recompile. Any exception here is intentional and
        // should bubble \u2014 a diagnostic command must surface every failure to
        // the operator (do not silently warn-and-continue).
        $tickerStyles->all();

        $this->info("Theme '{$themeName}' (slug={$themeSlug}) created at {$themeDir}");
        $this->line('  source mode: '.$mode);
        $this->line('  geometry: top='.$topPct.'% bottom='.$bottomPct.'% left='.$leftPct.'% right='.$rightPct.'%');
        $this->line('  splits: split1='.$split1.'% split2='.$split2.'% dyn='.($dyn ? 'true' : 'false'));
        $this->line('  label box: left='.$labelLeft.'% width='.$labelWidth.'% top='.$labelTop.'% height='.$labelHeight.'%');
        $this->line('  stamp metrics: '.json_encode($persistedMetrics));

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
            $this->info("Activated: ticker_style={$themeSlug}.png, ticker_use_image_style=true (workspace owner id={$owner->id})");
        } else {
            $this->line('  (Pass --activate to also set ticker_style on the active workspace.)');
        }

        $this->line('Verify with: php artisan ticker:list --slug='.$themeSlug);

        return self::SUCCESS;
    }

    /**
     * Single-image flow: source PNG \u2192 sliceFromSingle writes title/content/end.png
     * directly into $themeDir and returns the metric array.
     *
     * @return array<string, float|string>|null null on failure (slicer returned false or source missing)
     */
    private function runSingleSourceFlow(
        ThemeImageSlicer $slicer,
        string $themeDir,
        int $canvasWidth,
        float $split1,
        float $split2,
        float $topPct,
        float $bottomPct,
        float $leftPct,
        float $rightPct,
        bool $dyn,
    ): ?array {
        $sourcePath = $this->option('source');
        if ($sourcePath === null || ! is_file($sourcePath)) {
            $this->error('Source image not found: '.($sourcePath ?? '<null>'));

            return null;
        }

        $sliceMetrics = $slicer->sliceFromSingle(
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

        return is_array($sliceMetrics) ? $sliceMetrics : null;
    }

    /**
     * Copy flow: validate source paths \u2192 slice() with outputPng=null to
     * recompute metrics for the new geometry \u2192 write the three PNGs.
     *
     * @return array<string, float|string>|null null on failure (slicer returned false, or any source part missing)
     */
    private function runCopyFlow(
        ThemeImageSlicer $slicer,
        string $themeDir,
        int $canvasWidth,
        float $split1,
        float $split2,
        float $leftPct,
        float $rightPct,
        bool $dyn,
    ): ?array {
        $fromSlug = Str::slug($this->option('from-theme') ?? '');
        $fromDir = public_path("ticker-styles/{$fromSlug}");
        if ($fromSlug === '' || ! is_dir($fromDir)) {
            $this->error("Source theme directory not found: {$fromDir}");

            return null;
        }

        $titleSrc = $this->resolvePartPath($fromDir, 'title', $this->option('title'));
        if ($titleSrc === null) {
            return null;
        }
        $contentSrc = $this->resolvePartPath($fromDir, 'content', $this->option('content'));
        if ($contentSrc === null) {
            return null;
        }
        $endSrc = $this->resolvePartPath($fromDir, 'end', $this->option('end'));
        if ($endSrc === null) {
            return null;
        }

        $sliceMetrics = $slicer->slice(
            $titleSrc,
            $contentSrc,
            $endSrc,
            null,
            $canvasWidth,
            null,
            null,
            null,
            [$split1, $split2],
            $leftPct,
            $rightPct,
            $dyn,
        );

        if (! is_array($sliceMetrics)) {
            $this->error('Slice recompute failed for the copied parts (slicer returned false).');

            return null;
        }

        File::copy($titleSrc, $themeDir.'/title.png');
        File::copy($contentSrc, $themeDir.'/content.png');
        File::copy($endSrc, $themeDir.'/end.png');

        return $sliceMetrics;
    }

    private function detectInputMode(): ?string
    {
        $hasSource = ($this->option('source') ?? '') !== '';
        $hasFrom = ($this->option('from-theme') ?? '') !== '';
        if ($hasSource && $hasFrom) {
            return null;
        }
        if ($hasSource) {
            return 'source';
        }
        if ($hasFrom) {
            return 'from';
        }

        return null;
    }

    private function pctOption(string $name, float $default): float
    {
        $raw = $this->option($name);

        return $raw === null || $raw === '' ? $default : (float) $raw;
    }

    private function requiredPctOption(string $name): ?float
    {
        $raw = $this->option($name);
        if ($raw === null || $raw === '') {
            $this->error("--{$name} is required.");

            return null;
        }

        return (float) $raw;
    }

    /**
     * @return list<string>
     */
    private function validateGeometry(
        float $top,
        float $bottom,
        float $left,
        float $right,
        float $split1,
        float $split2,
        bool $dyn,
    ): array {
        $errors = [];
        if ($top >= $bottom) {
            $errors[] = '--top must be strictly less than --bottom';
        }
        if ($left >= $right) {
            $errors[] = '--left must be strictly less than --right';
        }
        if ($split1 <= $left + self::SLIDER_GAP_PERCENT) {
            $errors[] = '--split1 must be at least 1% greater than --left';
        }
        if ($split2 <= $split1 + self::SLIDER_GAP_PERCENT) {
            $errors[] = '--split2 must be at least 1% greater than --split1';
        }
        if (! $dyn && $split2 >= $right - self::SLIDER_GAP_PERCENT) {
            $errors[] = '--split2 must stay at least 1% inside --right (use --dyn to collapse end)';
        }
        if ($split1 < 0 || $split1 > 100 || $split2 < 0 || $split2 > 100) {
            $errors[] = '--split1 and --split2 must be in [0, 100]';
        }

        return $errors;
    }

    private function resolvePartPath(string $fromDir, string $partName, mixed $override): ?string
    {
        if (is_string($override) && $override !== '') {
            if (! is_file($override)) {
                $this->error("Override for --{$partName} not found: {$override}");

                return null;
            }

            return $override;
        }

        $candidate = $fromDir.'/'.$partName.'.png';
        if (! is_file($candidate)) {
            $this->error("Source theme part not found: {$candidate}");

            return null;
        }

        return $candidate;
    }

    private function cleanupPartialTheme(string $themeDir): void
    {
        if (! is_dir($themeDir)) {
            return;
        }

        try {
            File::deleteDirectory($themeDir);
            $this->warn("Cleaned up partial theme at {$themeDir} due to earlier failure.");
        } catch (Throwable $exception) {
            $this->warn("Could not clean up {$themeDir}: {$exception->getMessage()}");
        }
    }
}
