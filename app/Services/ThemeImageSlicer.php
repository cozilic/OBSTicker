<?php

namespace App\Services;

use GdImage;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Compile a 3-cut (title/content/end) ticker theme into a single
 * horizontal canvas strip by slotting each cut into its user-chosen
 * position on a fixed-dimension canvas.
 *
 * # Design (2026-07-18 fresh rewrite)
 *
 * The rewrite extracts three concerns into separate, testable units.
 * Replaces the prior 880-line `slice()` that contained an
 * `if ($dynamicContentStretch) { ... } else { ... }` committee-decision
 * branch and accumulated 8 historical `_compiled_under_dynamic_stretch_*`
 * string-marker-key suffixes across many iterative commits.
 *
 *   1. {@see ThemeGeometryMath::calculateSlots()} — pure-math slot
 *      coordinate calculation. NO GD, NO I/O. Unit-testable without
 *      any image fixtures.
 *
 *   2. {@see self::sliceStatic()} — DEFAULT render: title LEFT-anchored
 *      CONTAIN in its slot, content STRETCH-fit to fill its slot
 *      exactly, end RIGHT-anchored CONTAIN in its slot.
 *
 *   3. {@see self::sliceRepeating()} — content-aware flag render: same
 *      title/end placement as static, but content.png is TILED at
 *      NATIVE w*h inside its slot (multiple repetitions when the slot
 *      is wider than the source content cut).
 *
 * Cache bust detection moved to {@see ThemeCacheBuster}: a hash of
 * the effective geometry + flag is stored in compiled meta.json, and
 * any change to inputs triggers a recompile. Replaces the historical
 * `_compiled_under_dynamic_stretch_*` string-marker-key chain. The
 * rewrite also opportunistically strips those historical keys from
 * legacy compiled meta.json on the next write — see
 * {@see self::writeCompiledJson()}.
 *
 * # Public API (preserved for backward compatibility)
 *
 * - {@see self::slice()} — called by TickerStyleRepository::compileThemes();
 *   takes paths to three pre-cut PNGs + geometry args + flag.
 * - {@see self::sliceFromSingle()} — called by TickerDashboardController +
 *   CLI commands; takes ONE source PNG + split percentages + flag,
 *   cuts internally via {@see self::splitToTempPngs()} then routes
 *   to render pipeline.
 *
 * Both public entry points accept the same `$dynamicContentStretch`
 * flag they have for the past 5+ commits but internally route to
 * {@see self::sliceStatic()} vs {@see self::sliceRepeating()} via
 * the private {@see self::sliceLoaded()} orchestrator.
 */
class ThemeImageSlicer
{
    /**
     * Canvas width assumed when no explicit width is provided (e.g. when
     * {@see TickerStyleRepository::compileThemes()} runs without a per-
     * owner setting context, or when the controller uses a fallback).
     */
    public const int DEFAULT_CANVAS_WIDTH = 1920;

    /**
     * Maximum canvas height for a compiled theme. Capped so a single
     * tall accent in one slot cannot drive the whole ticker higher
     * than a "lower-third" line.
     */
    public const int MAX_STYLE_HEIGHT = 150;

    /**
     * Pixel-level safety floor for {@see self::splitToTempPngs()}.
     * Validation already enforces a 1% minimum slot width upstream,
     * but a sub-pixel source combined with two close splits could
     * still produce a zero-pixel region after {@see round()}.
     */
    public const int MIN_SLOT_PIXELS = 4;

    // ===================================================================
    // PUBLIC ENTRY POINTS — preserved signatures, internal routing only.
    // ===================================================================

    /**
     * Compile three pre-cut PNGs into a single horizontal strip.
     *
     * Public API preserved verbatim from the prior implementation; the
     * internals now route through {@see self::sliceLoaded()} which
     * delegates to {@see self::sliceStatic()} or
     * {@see self::sliceRepeating()} based on `$dynamicContentStretch`.
     *
     * @return array{
     *     title_stamp_left_pct: float,
     *     title_stamp_width_pct: float,
     *     end_stamp_left_pct: float,
     *     end_stamp_width_pct: float
     * }|false
     */
    /**
     * @param  array{0: float, 1: float}|null  $splitPercentages
     */
    public function slice(
        string $leftPath,
        string $middlePath,
        string $rightPath,
        ?string $themeDir = null,
        ?int $canvasWidth = null,
        ?string $outputPng = null,
        ?string $outputJson = null,
        ?string $originalJson = null,
        ?array $splitPercentages = null,
        ?float $leftPct = null,
        ?float $rightPct = null,
        bool $dynamicContentStretch = false,
    ): array<string, mixed>|false {
        // Path-traversal guard for any caller-provided writable path.
        foreach ([$themeDir, $outputPng, $outputJson, $originalJson] as $writablePath) {
            if ($writablePath === null) {
                continue;
            }
            if (str_contains($writablePath, '..') || str_contains($writablePath, "\0")) {
                return false;
            }
        }

        $leftImg = $this->loadImage($leftPath);
        $middleImg = $this->loadImage($middlePath);
        $rightImg = $this->loadImage($rightPath);

        if (! $leftImg || ! $middleImg || ! $rightImg) {
            if ($leftImg instanceof GdImage) {
                imagedestroy($leftImg);
            }
            if ($middleImg instanceof GdImage) {
                imagedestroy($middleImg);
            }
            if ($rightImg instanceof GdImage) {
                imagedestroy($rightImg);
            }

            return false;
        }

        try {
            return $this->sliceLoaded(
                $leftImg, $middleImg, $rightImg,
                $themeDir, $canvasWidth, $outputPng, $outputJson, $originalJson,
                $splitPercentages, $leftPct, $rightPct,
                $dynamicContentStretch,
            );
        } finally {
            imagedestroy($leftImg);
            imagedestroy($middleImg);
            imagedestroy($rightImg);
        }
    }

    /**
     * Cut a single full-canvas source into three sub-PNGs and run the
     * render pipeline. Public API preserved verbatim.
     *
     * @return array<string, mixed>|false
     */
    public function sliceFromSingle(
        string $sourcePath,
        float $split1,
        float $split2,
        ?string $themeDir = null,
        ?int $canvasWidth = null,
        bool $returnPreview = false,
        float $topPct = 0.0,
        float $bottomPct = 100.0,
        float $leftPct = 0.0,
        float $rightPct = 100.0,
        bool $dynamicContentStretch = false,
    ): array<string, mixed>|false {
        $tempDir = $this->newTempDir();

        try {
            $split = $this->splitToTempPngs(
                $sourcePath, $split1, $split2, $tempDir,
                $topPct, $bottomPct, $leftPct, $rightPct,
            );
            if ($split === null) {
                return false;
            }

            // Commit mode persists cut PNGs into $themeDir; preview
            // mode skips and base64-encodes the rendered preview.
            $commitThemeDir = $returnPreview ? null : $themeDir;
            $outputPng = $returnPreview
                ? $tempDir.'/preview.png'
                : ($themeDir !== null ? $themeDir.'/compiled.png' : null);
            // No merge JSON in this code path — the controller / CLI
            // call here for a fresh slice rather than a recompile
            // (TickerStyleRepository::compileThemes() is the recompile
            // path and goes through slice() directly with $originalJson).
            $outputJson = null;
            $originalJson = null;

            $metrics = $this->slice(
                $split['left'],
                $split['middle'],
                $split['right'],
                $commitThemeDir,
                $canvasWidth,
                $outputPng,
                $outputJson,
                $originalJson,
                [$split1, $split2],
                $leftPct,
                $rightPct,
                $dynamicContentStretch,
            );

            if (! is_array($metrics)) {
                return false;
            }

            // Persist the three cut PNGs into $themeDir so
            // TickerStyleRepository::compileThemes() can find them
            // on the next request. compileThemes() reads
            // public/ticker-styles/{slug}/{title,content,end}.png
            // for the recompile path; without this persistence the
            // freshly committed theme would be skipped because none
            // of findImageFile($themeDir, ...) would resolve. The
            // cut PNGs are PNG-compressed with alpha preserved by
            // splitToTempPngs(), so File::copy preserves alpha
            // bit-identically.
            if ($commitThemeDir !== null) {
                File::ensureDirectoryExists($commitThemeDir);
                File::copy($split['left'], $commitThemeDir.'/title.png');
                File::copy($split['middle'], $commitThemeDir.'/content.png');
                File::copy($split['right'], $commitThemeDir.'/end.png');
            }

            if ($returnPreview) {
                $previewPath = $tempDir.'/preview.png';
                if (! is_file($previewPath)) {
                    return false;
                }
                $metrics['preview_base64'] = base64_encode((string) file_get_contents($previewPath));
            }

            return $metrics;
        } finally {
            File::deleteDirectory($tempDir);
        }
    }

    // ===================================================================
    // PUBLIC RENDERERS — slot-position math + render in two clean methods.
    // Each takes pre-loaded GdImages + slots + a caller-owned canvas.
    // ===================================================================

    /**
     * Static render (default — `dynamic_content_stretch=false`).
     *
     * Slot-anchor convention (chosen so the user's three cuts map to
     * the visible "title at left, content in middle, end at right"
     * composition they see in the theme builder):
     *
     *   • Title block:  CONTAIN-fit, LEFT-anchored inside its slot.
     *                   Title stamp lands flush against canvas-LEFT
     *                   edge of the title slot (i.e. the user can drag
     *                   split_1 anywhere, and the title always sits
     *                   next to canvas-left of where they dragged it).
     *   • Content block: STRETCH-fit to fill its slot exactly between
     *                    line 2 and line 3. Each horizontal pixel of the
     *                    content slot is exactly one pixel of
     *                    content.png, no tiling.
     *   • End block:    CONTAIN-fit, RIGHT-anchored inside its slot.
     *                   End stamp lands flush against canvas-RIGHT edge
     *                   of the end slot.
     *
     * MUTATES the caller's $canvas. Caller destroys.
     */
    /**
     * @param  array{
     *     title: array{x: int, width: int},
     *     content: array{x: int, width: int},
     *     end: array{x: int, width: int},
     *     canvas_width: int
     * }  $slots
     */
    public function sliceStatic(
        GdImage $titleImg,
        GdImage $contentImg,
        GdImage $endImg,
        array $slots,
        GdImage $canvas,
        int $height,
    ): void {
        $this->blitContain(
            $canvas, $titleImg,
            $slots['title'], $height, 'left',
        );

        $this->blitStretch(
            $canvas, $contentImg,
            $slots['content'], $height,
        );

        $this->blitContain(
            $canvas, $endImg,
            $slots['end'], $height, 'right',
        );
    }

    /**
     * Repeating render (`dynamic_content_stretch=true`).
     *
     * Same title/end CONTAIN-fit placement as static (so dragging the
     * four cut lines produces identical title and end positioning in
     * both modes — only content behaves differently).
     *
     * Content block: TILED at NATIVE w*h inside its own slot only.
     * Tiles do NOT bleed past line 2 (split_1) or line 3 (split_2)
     * because tileStartX = slot.x and tileEndX = slot.x + slot.width.
     * When the content slot is wider than one native tile, multiple
     * full tiles are blitted in sequence followed by one partial-blit
     * tile that fills the residue (no pixel gap at the slot boundary).
     *
     * Vertical placement: each tile is centered inside the canvas when
     * its native height fits (tileH <= height), or top-aligned with
     * bottom-clipping when overflowing (matches unflagged y=0 top-
     * align convention used by STRETCH-fit content above).
     *
     * MUTATES the caller's $canvas. Caller destroys.
     */
    /**
     * @param  array{
     *     title: array{x: int, width: int},
     *     content: array{x: int, width: int},
     *     end: array{x: int, width: int},
     *     canvas_width: int
     * }  $slots
     */
    public function sliceRepeating(
        GdImage $titleImg,
        GdImage $contentImg,
        GdImage $endImg,
        array $slots,
        GdImage $canvas,
        int $height,
    ): void {
        $tileW = max(1, imagesx($contentImg));
        $tileH = max(1, imagesy($contentImg));
        $tileY = (int) max(0, round(($height - $tileH) / 2));

        $startX = $slots['content']['x'];
        $endX = $startX + $slots['content']['width'];
        $x = $startX;
        while ($x < $endX) {
            $drawW = min($tileW, $endX - $x);
            imagecopyresampled(
                $canvas,
                $contentImg,
                $x,
                $tileY,
                0,
                0,
                $drawW,
                $tileH,
                $drawW,
                $tileH,
            );
            $x += $drawW;
        }

        // Title and end sit ON TOP of the content base layer
        // (CONTAIN-fit, left/right anchored). Their slots are
        // adjacent to the content tile band (no overlap).
        $this->blitContain(
            $canvas, $titleImg,
            $slots['title'], $height, 'left',
        );
        $this->blitContain(
            $canvas, $endImg,
            $slots['end'], $height, 'right',
        );
    }

    // ===================================================================
    // PRIVATE ORCHESTRATOR + HELPERS
    // ===================================================================

    /**
     * Internal orchestrator that takes pre-loaded GdImages and runs
     * the slot math + render + (optional) JSON-write pipeline. Both
     * public entry points funnel here.
     */
    /**
     * @param  array{0: float, 1: float}|null  $splitPercentages
     * @return array{
     *     title_stamp_left_pct: float,
     *     title_stamp_width_pct: float,
     *     end_stamp_left_pct: float,
     *     end_stamp_width_pct: float
     * }
     */
    private function sliceLoaded(
        GdImage $leftImg,
        GdImage $middleImg,
        GdImage $rightImg,
        ?string $themeDir,
        ?int $canvasWidth,
        ?string $outputPng,
        ?string $outputJson,
        ?string $originalJson,
        ?array $splitPercentages,
        ?float $leftPct,
        ?float $rightPct,
        bool $dynamicContentStretch,
    ): array<string, mixed> {
        $effectiveWidth = max(1, $canvasWidth ?? self::DEFAULT_CANVAS_WIDTH);

        // Slot positions in canvas pixels. Testable in isolation via
        // ThemeGeometryMath::calculateSlots(). When splitPercentages
        // is null (legacy 3-file POST flow) the slot widths come
        // from imagesx() of each pre-cut PNG, scaled to fill the
        // canvas — preserved for backward compatibility with the
        // legacy upload flow in TickerDashboardController.
        if ($splitPercentages !== null) {
            $slots = ThemeGeometryMath::calculateSlots(
                $effectiveWidth,
                (float) ($leftPct ?? 0.0),
                (float) $splitPercentages[0],
                (float) $splitPercentages[1],
                (float) ($rightPct ?? 100.0),
            );
        } else {
            $leftSrcW = max(1, imagesx($leftImg));
            $middleSrcW = max(1, imagesx($middleImg));
            $rightSrcW = max(1, imagesx($rightImg));
            $totalSrcW = max(1, $leftSrcW + $middleSrcW + $rightSrcW);
            $scale = $effectiveWidth / $totalSrcW;

            $titleWidth = max(1, (int) round($leftSrcW * $scale));
            $endWidth = max(1, (int) round($rightSrcW * $scale));
            $contentWidth = max(1, $effectiveWidth - $titleWidth - $endWidth);

            $slots = [
                'title' => ['x' => 0, 'width' => $titleWidth],
                'content' => ['x' => $titleWidth, 'width' => $contentWidth],
                'end' => ['x' => $titleWidth + $contentWidth, 'width' => $endWidth],
                'canvas_width' => $effectiveWidth,
            ];
        }

        $height = self::resolveCanvasHeight($leftImg, $middleImg, $rightImg);

        // Stamp metrics are computeable BEFORE rendering, from the
        // alpha-aware visibleBounds of title/end + slot positions.
        // Stored alongside the rendered PNG so TickerStyleRepository
        // can hand them back to the JS consumer unchanged across
        // recompile passes.
        $metrics = $this->computeStampMetrics(
            $leftImg, $rightImg, $slots, $height,
        );

        if ($outputPng !== null) {
            File::ensureDirectoryExists(dirname($outputPng));

            $canvas = $this->createTransparentCanvas($slots['canvas_width'], $height);

            if ($dynamicContentStretch) {
                $this->sliceRepeating(
                    $leftImg, $middleImg, $rightImg,
                    $slots, $canvas, $height,
                );
            } else {
                $this->sliceStatic(
                    $leftImg, $middleImg, $rightImg,
                    $slots, $canvas, $height,
                );
            }

            imagepng($canvas, $outputPng, 9);
            imagedestroy($canvas);
        }

        if ($outputJson !== null) {
            $this->writeCompiledJson(
                $outputJson, $originalJson, $metrics, [
                    'left_pct' => (float) ($leftPct ?? 0.0),
                    'right_pct' => (float) ($rightPct ?? 100.0),
                    'split_1' => (float) ($splitPercentages[0] ?? 0.0),
                    'split_2' => (float) ($splitPercentages[1] ?? 100.0),
                    'dynamic_content_stretch' => $dynamicContentStretch,
                ],
            );
        }

        return $metrics;
    }

    /**
     * Slot-rendered alpha-aware stamp metrics (consumed by show.tsx
     * to position the live label-box overlay over the visible stamp).
     *
     * For each of title/end:
     *   1. Compute the CONTAIN-fit scale used by blitContain() —
     *      min(slotW/srcW, height/srcH). Using the same scale here
     *      guarantees the metric position matches the rendered pixel.
     *   2. Map alpha-trimmed visibleBounds() into canvas coords
     *      using that scale + the slot's anchor offset (0 for title,
     *      slotW - drawW for end).
     *
     * Output: four `*_stamp_*_pct` values consumed by
     * `manualLabelBox` in resources/js/pages/ticker/show.tsx.
     */
    /**
     * @param  array{
     *     title: array{x: int, width: int},
     *     content: array{x: int, width: int},
     *     end: array{x: int, width: int},
     *     canvas_width: int
     * }  $slots
     * @return array{
     *     title_stamp_left_pct: float,
     *     title_stamp_width_pct: float,
     *     end_stamp_left_pct: float,
     *     end_stamp_width_pct: float
     * }
     */
    private function computeStampMetrics(
        GdImage $titleImg,
        GdImage $endImg,
        array $slots,
        int $height,
    ): array<string, mixed> {
        $titleBounds = $this->visibleBounds($titleImg);
        $endBounds = $this->visibleBounds($endImg);

        // Title: LEFT-anchored CONTAIN. Blit offset inside slot = 0.
        $titleScale = self::containScale(
            $slots['title']['width'], max(1, imagesx($titleImg)),
            $height, imagesy($titleImg),
        );
        $titleVisSrcW = max(1, $titleBounds['right'] - $titleBounds['left'] + 1);
        $titleCanvasX = $slots['title']['x']
            + 0
            + ($titleBounds['left'] * $titleScale);
        $titleCanvasW = $titleVisSrcW * $titleScale;

        // End: RIGHT-anchored CONTAIN. Blit offset inside slot =
        // (slotW - drawW) so the end image's right edge touches the
        // slot's right edge.
        $endScale = self::containScale(
            $slots['end']['width'], max(1, imagesx($endImg)),
            $height, imagesy($endImg),
        );
        $endDrawW = max(1, (int) round(max(1, imagesx($endImg)) * $endScale));
        $endBlitOffsetInSlot = max(0, $slots['end']['width'] - $endDrawW);
        $endVisSrcW = max(1, $endBounds['right'] - $endBounds['left'] + 1);
        $endCanvasX = $slots['end']['x']
            + $endBlitOffsetInSlot
            + ($endBounds['left'] * $endScale);
        $endCanvasW = $endVisSrcW * $endScale;

        return [
            'title_stamp_left_pct' => ThemeGeometryMath::percentValue(
                (float) $titleCanvasX, $slots['canvas_width'],
            ),
            'title_stamp_width_pct' => ThemeGeometryMath::percentValue(
                (float) $titleCanvasW, $slots['canvas_width'],
            ),
            'end_stamp_left_pct' => ThemeGeometryMath::percentValue(
                (float) $endCanvasX, $slots['canvas_width'],
            ),
            'end_stamp_width_pct' => ThemeGeometryMath::percentValue(
                (float) $endCanvasW, $slots['canvas_width'],
            ),
        ];
    }

    /**
     * CONTAIN-fit scale formula: the smallest of (slotW/srcW) and
     // (height/srcH) so the source fits inside BOTH constraints. Used
     * by both {@see self::blitContain()} (for pixel placement) and
     * {@see self::computeStampMetrics()} (for visibleBounds mapping)
     * so they stay in lockstep — a change to one MUST change the other
     * or the live label-box sits in the wrong place.
     */
    private static function containScale(
        int $slotW,
        int $srcW,
        int $slotH,
        int $srcH,
    ): float {
        $slotW = max(1, $slotW);
        $slotH = max(1, $slotH);
        $srcW = max(1, $srcW);
        $srcH = max(1, $srcH);

        return min(($slotW / $srcW), ($slotH / $srcH));
    }

    /**
     * CONTAIN-fit blit into a slot with optional left/right anchor.
     */
    /**
     * @param  array{x: int, width: int}  $slot
     */
    private function blitContain(
        GdImage $canvas,
        GdImage $src,
        array $slot,
        int $height,
        string $anchor,
    ): void {
        $srcW = max(1, imagesx($src));
        $srcH = max(1, imagesy($src));
        $slotW = max(1, (int) $slot['width']);

        $scale = self::containScale($slotW, $srcW, $height, $srcH);

        $drawW = max(1, (int) round($srcW * $scale));
        $drawH = max(1, (int) round($srcH * $scale));

        $offsetX = ($anchor === 'right')
            ? max(0, $slotW - $drawW)
            : 0;
        $offsetY = max(0, (int) round(($height - $drawH) / 2));

        imagecopyresampled(
            $canvas, $src,
            (int) $slot['x'] + $offsetX,
            $offsetY,
            0,
            0,
            $drawW,
            $drawH,
            $srcW,
            $srcH,
        );
    }

    /**
     * STRETCH-fit blit (slotW × slotH, ignore source aspect). Used by
     * static content render so content.png fills its slot exactly
     * (no tiling, no seams, 1:1 pixel mapping scaled to slot dim).
     */
    /**
     * @param  array{x: int, width: int}  $slot
     */
    private function blitStretch(
        GdImage $canvas,
        GdImage $src,
        array $slot,
        int $height,
    ): void {
        $srcW = max(1, imagesx($src));
        $srcH = max(1, imagesy($src));
        imagecopyresampled(
            $canvas, $src,
            (int) $slot['x'],
            0,
            0,
            0,
            max(1, (int) $slot['width']),
            max(1, $height),
            $srcW,
            $srcH,
        );
    }

    /**
     * Construct a fully-transparent canvas of given dimensions.
     */
    private function createTransparentCanvas(int $width, int $height): GdImage
    {
        $width = max(1, $width);
        $height = max(1, $height);

        $canvas = imagecreatetruecolor($width, $height);
        imagealphablending($canvas, false);
        imagesavealpha($canvas, true);
        $transparent = imagecolorallocatealpha($canvas, 0, 0, 0, 127);
        if ($transparent === false) {
            imagedestroy($canvas);
            throw new RuntimeException('Failed to allocate transparent color');
        }
        imagefilledrectangle($canvas, 0, 0, $width, $height, $transparent);

        return $canvas;
    }

    /**
     * Computed canvas height: max of the 3 source heights, capped at
     * MAX_STYLE_HEIGHT = 150, floored at 32 (so very thin sources
     * still render a usable strip rather than a 1px-tall sliver).
     */
    private static function resolveCanvasHeight(
        GdImage $titleImg,
        GdImage $contentImg,
        GdImage $endImg,
    ): int {
        return max(32, min(
            self::MAX_STYLE_HEIGHT,
            (int) round(max(
                imagesy($titleImg),
                imagesy($contentImg),
                imagesy($endImg),
            )),
        ));
    }

    /**
     * Persist compiled JSON: merge with `$originalJson` if present
     * (preserves the user's name/author/label_pct et al.), drop any
     * historical `_compiled_under_dynamic_stretch_*` marker keys
     * (the prior generation's recompile-cache strategy — now retired
     * by {@see ThemeCacheBuster::generateHash()}), and write the new
     * `geometry_hash` field for cache-bust detection on next read.
     */
    /**
     * @param  array{
     *     title_stamp_left_pct: float,
     *     title_stamp_width_pct: float,
     *     end_stamp_left_pct: float,
     *     end_stamp_width_pct: float
     * }  $metrics
     * @param  array<string, mixed>  $effectiveSettings
     */
    private function writeCompiledJson(
        string $outputJson,
        ?string $originalJson,
        array $metrics,
        array $effectiveSettings,
    ): void {
        $meta = $metrics;

        if ($originalJson !== null && is_file($originalJson)) {
            $existing = json_decode((string) file_get_contents($originalJson), true);
            if (is_array($existing)) {
                // Drop historical `_compiled_under_dynamic_stretch_*`
                // markers — they have no meaning under the new hash-
                // based cache and would otherwise drag the legacy key
                // forward across every recompile.
                foreach (array_keys($existing) as $key) {
                    if (is_string($key) && str_starts_with($key, '_compiled_under_dynamic_stretch_')) {
                        unset($existing[$key]);
                    }
                }
                $meta = array_merge($existing, $metrics);
            }
        }

        $meta['geometry_hash'] = ThemeCacheBuster::generateHash($effectiveSettings);

        File::ensureDirectoryExists(dirname($outputJson));
        File::put(
            $outputJson,
            (string) json_encode($meta, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES).PHP_EOL,
        );
    }

    // ===================================================================
    // CUT STAGE + GD/IO HELPERS
    // ===================================================================

    /**
     * Cut a single source-PNG into three sub-PNGs at the user's chosen
     * X-coordinate percentages, applying 2D bbox crop and
     * MIN_SLOT_PIXELS clamping. Returns null on any GD failure.
     *
     * @return array{left: string, middle: string, right: string, width: int, height: int}|null
     */
    private function splitToTempPngs(
        string $sourcePath,
        float $split1,
        float $split2,
        string $tempDir,
        float $topPct = 0.0,
        float $bottomPct = 100.0,
        float $leftPct = 0.0,
        float $rightPct = 100.0,
    ): ?array {
        $source = $this->loadImage($sourcePath);
        if (! $source instanceof GdImage) {
            return null;
        }

        try {
            $sourceWidth = imagesx($source);
            $sourceHeight = imagesy($source);

            $leftX = (int) round(($leftPct / 100) * $sourceWidth);
            $rightX = (int) round(($rightPct / 100) * $sourceWidth);
            $topY = (int) round(($topPct / 100) * $sourceHeight);
            $bottomY = (int) round(($bottomPct / 100) * $sourceHeight);

            // Defensive clamps: every coordinate must be valid for
            // GD's imagecrop(), which silently fails on out-of-range
            // or zero/negative-width regions.
            $topY = max(0, $topY);
            $bottomY = min($sourceHeight, max($topY + 1, $bottomY));
            $leftX = max(0, $leftX);
            $rightX = min($sourceWidth, max($leftX + 1, $rightX));

            $bboxWidth = $rightX - $leftX;
            $bboxHeight = $bottomY - $topY;

            $cutX1 = (int) round(($split1 / 100) * $sourceWidth);
            $cutX2 = (int) round(($split2 / 100) * $sourceWidth);

            // Splits live inside the bbox; clamp to MIN_SLOT_PIXELS
            // floor so GD never receives a degenerate slot.
            $cutX1 = max($leftX + self::MIN_SLOT_PIXELS, min($rightX - self::MIN_SLOT_PIXELS, $cutX1));
            $cutX2 = max($cutX1 + self::MIN_SLOT_PIXELS, min($rightX - self::MIN_SLOT_PIXELS, $cutX2));

            $title = imagecrop($source, ['x' => $leftX, 'y' => $topY, 'width' => $cutX1 - $leftX, 'height' => $bboxHeight]);
            $middle = imagecrop($source, ['x' => $cutX1, 'y' => $topY, 'width' => $cutX2 - $cutX1, 'height' => $bboxHeight]);
            $right = imagecrop($source, ['x' => $cutX2, 'y' => $topY, 'width' => $rightX - $cutX2, 'height' => $bboxHeight]);

            if (! $title instanceof GdImage || ! $middle instanceof GdImage || ! $right instanceof GdImage) {
                if ($title instanceof GdImage) {
                    imagedestroy($title);
                }
                if ($middle instanceof GdImage) {
                    imagedestroy($middle);
                }
                if ($right instanceof GdImage) {
                    imagedestroy($right);
                }

                return null;
            }

            imagealphablending($title, false);
            imagesavealpha($title, true);
            imagealphablending($middle, false);
            imagesavealpha($middle, true);
            imagealphablending($right, false);
            imagesavealpha($right, true);

            imagepng($title, $tempDir.'/title.png', 9);
            imagepng($middle, $tempDir.'/content.png', 9);
            imagepng($right, $tempDir.'/end.png', 9);

            imagedestroy($title);
            imagedestroy($middle);
            imagedestroy($right);

            return [
                'left' => $tempDir.'/title.png',
                'middle' => $tempDir.'/content.png',
                'right' => $tempDir.'/end.png',
                'width' => $bboxWidth,
                'height' => $bboxHeight,
            ];
        } finally {
            imagedestroy($source);
        }
    }

    /**
     * Build a temp directory unique to this slice call. The random
     * suffix keeps concurrent requests from racing on the same host.
     */
    private function newTempDir(): string
    {
        $path = sys_get_temp_dir().'/ticker-slice-'.Str::random(16);
        File::ensureDirectoryExists($path);

        return $path;
    }

    /**
     * Alpha-preserving file load. imagecreatefromstring() does not
     * enable alpha preservation by default — without the two flags
     * below, designed transparent viewports and the alpha-trimmed
     * pad would never reach the compiled PNG.
     */
    private function loadImage(string $path): GdImage|false
    {
        $contents = @file_get_contents($path);
        if ($contents === false) {
            return false;
        }

        $image = @imagecreatefromstring($contents);
        if (! $image instanceof GdImage) {
            return false;
        }

        imagealphablending($image, false);
        imagesavealpha($image, true);

        return $image;
    }

    /**
     * Find the alpha-trim (visible-opaque) bounding box of an image.
     * Two-pass scan of every pixel's alpha channel.
     *
     * @return array{left: int, right: int, top: int, bottom: int}
     */
    private function visibleBounds(GdImage $img): array
    {
        $width = imagesx($img);
        $height = imagesy($img);

        $left = $width;
        $right = -1;
        $top = $height;
        $bottom = -1;

        for ($y = 0; $y < $height; $y++) {
            for ($x = 0; $x < $width; $x++) {
                $packed = (int) imagecolorat($img, $x, $y);
                $alpha = ($packed >> 24) & 0x7F;
                if ($alpha >= 127) {
                    continue;
                }

                if ($x < $left) {
                    $left = $x;
                }
                if ($x > $right) {
                    $right = $x;
                }
                if ($y < $top) {
                    $top = $y;
                }
                if ($y > $bottom) {
                    $bottom = $y;
                }
            }
        }

        if ($right < 0) {
            return ['left' => 0, 'right' => $width - 1, 'top' => 0, 'bottom' => $height - 1];
        }

        return ['left' => $left, 'right' => $right, 'top' => $top, 'bottom' => $bottom];
    }
}
