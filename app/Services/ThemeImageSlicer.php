<?php

namespace App\Services;

use GdImage;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;

class ThemeImageSlicer
{
    /**
     * Canvas width assumed when no explicit width is provided (e.g. when
     * {@see TickerStyleRepository::compileThemes()} runs
     * without a per-owner setting context).
     */
    public const int DEFAULT_CANVAS_WIDTH = 1920;

    /**
     * Maximum canvas height for a compiled theme. The width-first slot
     * allocation makes the canvas height the natural result of the
     * proportional scale, but a single tall part (e.g. a 537px-tall
     * end.png accent) would otherwise drive the whole ticker to that
     * height while the title/content sit at 150px. Capping at 150px
     * keeps the design on a single horizontal "lower-third" line —
     * any part that would be taller is scaled down to fit, preserving
     * aspect ratio. The 32px floor still applies below this value so
     * very thin sources produce a usable canvas.
     */
    public const int MAX_STYLE_HEIGHT = 150;

    /**
     * Pixel-level safety floor for {@see self::splitToTempPngs()}. Validation
     * already enforces a 1% minimum slot width at the controller, but a
     * single-digit source image combined with two close splits could still
     * leave a slot a fraction of a pixel wide after {@see round()}. Clamping
     * to MIN_SLOT_PIXELS keeps {@see imagecrop()} from being asked for a
     * zero- or negative-width region, which GD silently fails.
     */
    public const int MIN_SLOT_PIXELS = 4;

    /**
     * Combine three PNG/JPEG images into a theme by slotting each into the
     * title/content/end position of a single horizontal canvas. Renamed from
     * `stitch()` when the adjacent slice-from-single flow was added; the
     * verb "slice" now refers to the whole pipeline (cut OR slot) rather
     * than the specific 3-into-1 shape, which keeps the controller and
     * repository call sites consistent.
     *
     * The method supports two combined modes:
     *
     *  - **Commit mode** (controller): when $themeDir is given, the
     *    three cut-region halves are written into $themeDir as PNGs
     *    WITHOUT trimming their transparent padding. Doing so used to
     *    strip designed fades/gutters the user baked into the source's
     *    cut boundaries, leaving CONTAIN-fit to render the visible
     *    accent as a tiny corner piece. With the cut boundaries
     *    derived from the user's split percentages rather than
     *    imagesx(), the source's transparent padding lands where the
     *    user designed it. Metrics are returned for the caller to
     *    persist alongside its own metadata.
     *
     *  - **Compile mode** (TickerStyleRepository): when $outputPng and/or
     *    $outputJson are given, a single horizontal compiled PNG is written
     *    to $outputPng and a merged JSON (original $originalJson overridden
     *    by the computed metrics) is written to $outputJson.
     *
     * Both modes can be combined in a single call.
     *
     * Returns the computed metrics array, or false on failure (bad input,
     * write target outside an expected directory, etc.).
     *
     * @param  array{float, float}|null  $splitPercentages
     *                                                      Optional [split_1, split_2] percentages from the original
     *                                                      commit. When non-null, slot widths derive from these
     *                                                      percentages × canvasWidth rather than from imagesx()
     *                                                      of the cuts — using the latter would collapse the
     *                                                      chosen proportions whenever the source had transparent
     *                                                      padding inside a cut region. Two callers forward this
     *                                                      argument: TickerStyleRepository::compileThemes
     *                                                      (recompile read path on every theme load) and
     *                                                      ThemeImageSlicer::sliceFromSingle (commit + preview
     *                                                      write path, after the 2026-07-15 alignment fix that
     *                                                      routed preview/commit through the same absolute-
     *                                                      percentage math as recompile). When null, the input
     *                                                      PNGs are treated as a legacy 3-file payload and slot
     *                                                      widths are derived from imagesx() of the cuts.
     * @return array{
     *     title_stamp_left_pct: float,
     *     title_stamp_width_pct: float,
     *     end_stamp_left_pct: float,
     *     end_stamp_width_pct: float
     * }|false
     */
    public function slice(
        string $leftPath,
        string $middlePath,
        string $rightPath,
        ?string $themeDir = null,
        ?int $canvasWidth = null,
        ?string $outputPng = null,
        ?string $outputJson = null, ?string $originalJson = null,
        ?array $splitPercentages = null,
        ?float $leftPct = null,
        ?float $rightPct = null,        // Content-Aware flag — when true:
        //   (a) content.png is alpha-trimmed for clean tile seams
        //       and tiled horizontally across the bbox middle
        //       region ($bboxLeftPx + $leftWidth ..
        //       $bboxRightPx - $rightWidth). Outside-bbox canvas
        //       stays transparent.
        //   (b) title.png is right-anchored inside the title slot
        //       ending at split_1 (CONTAIN-fit, no alpha-trim —
        //       see the in-method comment + CACHE NOTE for the
        //       fitInBox() over-stretch rationale).
        //   (c) end.png is left-anchored inside the end slot
        //       starting at split_2 (CONTAIN-fit, no alpha-trim —
        //       same constraint as title). Content tiles NEVER
        //       bleed past the end.png position.
        //
        // Canvas-height = max(heights of all 3 parts) capped at
        // MAX_STYLE_HEIGHT and floored at 32 — a tall hidden accent
        // in either title or end still drives the canvas height
        // without getting vertically cropped (CONTAIN-fit keeps
        // aspect). Flag is runtime-only; source meta.json keeps
        // recorded splits for full re-edit-ability when the flag
        // is later untoggled. Defaults to false to preserve the
        // unflagged recompile contract for legacy themes.
        bool $dynamicContentStretch = false,
    ): array|false {
        foreach ([$themeDir, $outputPng, $outputJson, $originalJson] as $writablePath) {
            if ($writablePath === null) {
                continue;
            }

            // Reject anything that could escape its intended directory.
            if (str_contains($writablePath, '..') || str_contains($writablePath, "\0")) {
                return false;
            }
        }

        $leftImg = $this->loadImage($leftPath);
        $middleImg = $this->loadImage($middlePath);
        $rightImg = $this->loadImage($rightPath);

        if (! $leftImg || ! $middleImg || ! $rightImg) {
            // Free any GdImage resources we successfully allocated before
            // bailing — otherwise every failed upload leaks memory.
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
        }            try {
            $leftOriginalWidth = imagesx($leftImg);
            $middleOriginalWidth = imagesx($middleImg);
            $rightOriginalWidth = imagesx($rightImg);

            // Alpha-trim every source regardless of commit-vs-recompile
            // mode. The result drives the title_stamp_*_pct /
            // end_stamp_*_pct metrics below so they describe where the
            // VISIBLE OPAQUE artwork lands, not where the SLIDER bbox
            // lands. A source PNG whose designer baked in transparent
            // padding around the logo (rounded corners, a fade to
            // nothing at one edge, etc.) puts that padding INSIDE the
            // CONTAIN-fit bbox; without alpha-trim the label overlay
            // ends up centered over the bbox with semi-empty space
            // inside, which the user reads as "text spills past the
            // visible artwork". Bbox coordinates are intentionally
            // preserved for the on-disk PNGs and the compiled output
            // PNG so the visual stamp keeps rendering inside the
            // slider over time (the recompile path then has the same
            // pixel source to copy).
            $leftBounds = $this->visibleBounds($leftImg);
            $rightBounds = $this->visibleBounds($rightImg);
            // Pre-compute content.png's visible bounds so the dynamic-
            // content-stretch path can alpha-trim the tile at blit
            // time without re-scanning the pixel array twice. The
            // trim runs only when dynamic_content_stretch is on, but
            // the bounds themselves are at most imagesx*imagesy pixels
            // (cheap for ticker-sized sources) and might be needed
            // twice — once for $height and once for the trim — so
            // computing once is the right trade.
            $middleBounds = $this->visibleBounds($middleImg);

            // Persist the UN-trimmed cut-region halves to $themeDir
            // whenever the caller asked for them. TickerStyleRepository
            // ::compileThemes() (the recompile read path) passes
            // $themeDir=null so this block is a no-op on that path;
            // the only writer to $themeDir is
            // {@see self::sliceFromSingle()} via the controller
            // commit/preview endpoints. Earlier revisions ran an
            // alpha-crop here that trimmed the on-disk halves to
            // the visible-bounds rect, but that stripping deleted
            // deliberate fades/gutters the user designed around the
            // visible artwork — they were the same transparent
            // pixels visibleBounds() ignores. Alpha awareness for
            // the *metrics* happens above via the bounds we're
            // already holding; the on-disk PNGs stay un-trimmed so
            // the recompile path sees the same pixel source on every
            // read.
            if ($themeDir !== null) {
                File::ensureDirectoryExists($themeDir);

                // PNG compression level 9 keeps the on-disk theme assets
                // small without affecting the alpha channel.
                imagepng($leftImg, $themeDir.'/title.png', 9);
                imagepng($middleImg, $themeDir.'/content.png', 9);
                imagepng($rightImg, $themeDir.'/end.png', 9);
            }

            $effectiveCanvasWidth = max(1, $canvasWidth ?? self::DEFAULT_CANVAS_WIDTH);

            if ($splitPercentages !== null) {
                // Recompile flow: slot widths come from the user's chosen
                // split percentages directly. Using imagesx() here would
                // treat the post-trim dimensions as "pre-trim" widths and
                // collapse the proportions whenever the source had
                // transparent padding inside a cut region — the saved
                // PNGs in this pass are post-trim, and any proportional
                // math over their widths would compress the canvas space
                // the designer intentionally left transparent.
                //
                // Bbox-aware slot math: pull the slot boundaries inside
                // the source-painted bbox (left_pct .. right_pct) so the
                // rendered artwork sits where the designer dragged the
                // handles instead of bleeding past it. With
                // `dynamic_content_stretch` on (split_2 == right_pct), the
                // right-slot width collapses to zero so the user gets
                // exactly what they previewed in the theme builder.
                $bboxLeftPct = max(0.0, min(99.99, (float) ($leftPct ?? 0.0)));
                $bboxRightPct = max($bboxLeftPct + 0.01, min(100.0, (float) ($rightPct ?? 100.0)));

                [$userSplit1, $userSplit2] = $splitPercentages;
                // Re-clamp splits inside the bbox so an out-of-range stored
                // value can't push a slot off-canvas. The validator already
                // enforces these upstream, so this is purely defensive.
                $userSplit1 = max($bboxLeftPct + 0.01, min($bboxRightPct - 0.01, (float) $userSplit1));
                $userSplit2 = max($userSplit1 + 0.01, min($bboxRightPct, (float) $userSplit2));

                // runtime-only flag: bbox/splits are NOT mutated here.
                // Earlier bilateral revisions (slot-math override +
                // cut-stage override) tried snapping user splits
                // to 0/100 so middle.png encompassed the whole
                // source — that pulled artwork the artist designed
                // outside their recorded cuts into the visible
                // strip. We now keep the user's recorded splits
                // both at cut time and in slot math; the
                // single-blit content blit further down still
                // DROPS title/end.png from the rendered output.
                // The artist sees ONLY the content slice (their
                // recorded split_1..split_2 region) stretched
                // seam-free across the full canvas.
                //
                // Source meta.json keeps the user's recorded
                // split_1 / split_2 / left_pct / right_pct for
                // full re-edit-ability in the theme builder when
                // they later untoggle the flag (untoggling reruns
                // the recompile through the normal 3-slot path and
                // restores the original bbox / slot geometry).
                //
                // CACHE NOTE: meta.json is not mutated, so the
                // recompile's mtime-based cache
                // TickerStyleRepository::compileThemes() additionally
                // busts on the strategy-named
                // `_compiled_under_dynamic_stretch_content_only_alpha_trim`
                // marker we write into compiled meta.json below —
                // legacy metas (including those carrying the older
                // `_compiled_under_dynamic_stretch_left_to_right_clip_last`,
                // `_compiled_under_dynamic_stretch_right_anchored_last_tile`,
                // `_compiled_under_dynamic_stretch_canvas_wide_alpha_trim`,
                // `_compiled_under_dynamic_stretch_seamless_extend`,
                // `_compiled_under_dynamic_stretch_alpha_trim_repeat_tile`,
                // `_compiled_under_dynamic_stretch_single_blit`, and
                // bilateral-cut-stage strategies'
                // `_compiled_under_dynamic_override` markers) lack
                // the current strategy's key and are forced to
                // recompile exactly once on the first deploy of the
                // new strategy. Marker key is strategy-named so a
                // bump forces a clean rebuild across all dynamic-
                // stretched themes.

                // Compute the bbox pixel anchors BEFORE the slot widths so
                // the residue math below can reference them without PHP
                // emitting an undefined-variable notice and defaulting the
                // to zero (which would otherwise collapse the middle blit
                // and let the right slot overlap the middle). This mirrors
                // the first-pass branch, which assigns $bboxLeftPx /
                // $bboxRightPx at the top of its block for the same reason.
                $bboxLeftPx = (int) round(($bboxLeftPct / 100.0) * $effectiveCanvasWidth);
                $bboxRightPx = (int) round(($bboxRightPct / 100.0) * $effectiveCanvasWidth);

                $leftWidth = max(1, (int) round((($userSplit1 - $bboxLeftPct) / 100.0) * $effectiveCanvasWidth));
                $rightWidth = max(1, (int) round((($bboxRightPct - $userSplit2) / 100.0) * $effectiveCanvasWidth));
                // Middle width is the integer-pixel residue between $bboxLeftPx
                // and $bboxRightPx (NOT a third independent round()). When the
                // user picks splits like 14.5%/85.5% at canvas=1920, the
                // independent rounds produce 278 + 1363 + 278 = 1919 — leaving
                // a one-pixel transparent column at the middle→right seam,
                // which the live shell renders as a hairline "black line" at
                // split_2 (the body color shows through). The residue math
                // guarantees leftWidth + middleWidth + rightWidth =
                // $bboxRightPx - $bboxLeftPx exactly, eliminating any seam
                // drift while keeping $leftWidth/$rightWidth (and the visible
                // stamp metrics derived from them) bit-identical to before.
                // The first-pass branch already used this residue pattern;
                // the recompile branch is now consistent with it.
                $middleWidth = max(1, $bboxRightPx - $bboxLeftPx - $leftWidth - $rightWidth);

                // Already-trimmed PNGs sit at their natural heights; the
                // tallest wins, capped at MAX_STYLE_HEIGHT so an oversized
                // accent cannot stretch the whole ticker, with the 32px
                // floor still applying for very thin sources. The legacy
                // max-of-3-parts rule applies under dynamic_content_stretch
                // too — title and end are blitted (CONTAIN-fit into their
                // slots) under the flag, so a tall hidden accent in either
                // can drive the canvas height without getting vertically
                // cropped.
                $height = max(32, min(
                    self::MAX_STYLE_HEIGHT,
                    (int) round(max(
                        imagesy($leftImg),
                        imagesy($middleImg),
                        imagesy($rightImg),
                    )),
                ));
            } else {
                // Legacy 3-file fallback (no `$splitPercentages`):
                // slot widths are derived from imagesx() of each cut
                // region and allocated proportionally across the
                // canvas. Used only by the legacy title-/content-/
                // end.png POST payload in
                // {@see TickerDashboardController::handleLegacyStitch()},
                // which moves the three halves onto disk before
                // calling slice() without forwarding percentages —
                // preserved here so that legacy uploads keep
                // rendering without forcing the artist to recompose
                // through the single-source-image theme builder.
                // The preview/commit path through
                // {@see self::sliceFromSingle()} now forwards
                // [$split1, $split2], so it never reaches this
                // branch.
                $bboxLeftPx = 0;
                $bboxRightPx = $effectiveCanvasWidth;
                // First-pass flow proportional allocation, keyed off the
                // ORIGINAL (pre-trim) split widths. Cuts at 20 / 80 produce
                // slots at 20% / 60% / 20% of the canvas width regardless
                // of transparent padding inside each cut region.
                $totalOriginalWidth = max(1, $leftOriginalWidth + $middleOriginalWidth + $rightOriginalWidth);
                $scaleFactor = $effectiveCanvasWidth / $totalOriginalWidth;

                $leftWidth = max(1, (int) round($leftOriginalWidth * $scaleFactor));
                $rightWidth = max(1, (int) round($rightOriginalWidth * $scaleFactor));
                $middleWidth = max(1, $effectiveCanvasWidth - $leftWidth - $rightWidth);

                $height = max(32, min(
                    self::MAX_STYLE_HEIGHT,
                    (int) round(max(
                        imagesy($leftImg),
                        imagesy($middleImg),
                        imagesy($rightImg),
                    )),
                ));
            }

            // Fit each part into its slot with asymmetric anchoring so
            // the stamped bounds align flush against the React dividers:
            //   • MIDDLE ("content"): STRETCHES into the slot dimensions —
            //     dynamic region that grows/shrinks with the user's
            //     dividers. No padding inside the slot.
            //   • LEFT ("title"): CONTAIN (aspect-preserving), then
            //     right-anchored against the title→content divider so the
            //     stamp's right edge touches the divider line. Any
            //     transparent padding lands on the canvas-left side,
            //     away from dividers.
            //   • RIGHT ("end"): CONTAIN (aspect-preserving), then
            //     left-anchored against the content→end divider so the
            //     stamp's left edge touches the divider line. Any
            //     transparent padding lands on the canvas-right side,
            //     away from dividers.
            // Without this override the CONTAIN mode centers both title
            // and end with transparent padding on BOTH sides of the
            // stamp, so the dividers (slot edges) cross transparent
            // gutters — the user reads that as "the parts don't sit
            // together" because the dividers don't actually touch any
            // opaque content. Edge-anchoring solves this.
            $leftFit = $this->fitInBox($leftWidth, $height, imagesx($leftImg), imagesy($leftImg), 'contain');
            $leftFit[2] = $leftWidth - $leftFit[0];  // right-anchor inside title slot

            $middleFit = $this->fitInBox($middleWidth, $height, imagesx($middleImg), imagesy($middleImg), 'stretch');

            $rightFit = $this->fitInBox($rightWidth, $height, imagesx($rightImg), imagesy($rightImg), 'contain');
            $rightFit[2] = 0;  // left-anchor inside end slot

            // Alpha-aware visible-stamp metrics. CONTAIN-fit alone reports
            // the BBOX the slot occupies — which is correct for the
            // compiled PNG pixel painting, but for the live ticker label
            // overlay we need the position of the VISIBLE OPAQUE artwork
            // inside that bbox. visibleBounds() excludes pixels whose
            // alpha is at or above 127 (fully / near-fully transparent) so
            // source-internal transparent gutters (rounded corners,
            // designed fades-to-nothing, use of padding around the logo)
            // shrink the metric rect to where the artwork actually is.
            // The slot pixel coordinates are reused for the compiled PNG
            // (the bbox copy is unchanged) — only the *metrics* describing
            // the stamp to the JS consumer are alpha-trimmed.
            //
            // The width and source dimensions are pinned by the caller
            // and fitInBox() above (>0 always), so dividing straight
            // through is safe — the redundant zero-guard tripped
            // PHPStan's always-true comparison check on the prior
            // defensive form.
            $leftScale = $leftFit[0] / imagesx($leftImg);
            $rightScale = $rightFit[0] / imagesx($rightImg);
            $leftVisibleSrc = max(1, $leftBounds['right'] - $leftBounds['left'] + 1);
            $leftVisibleXInSlot = $leftBounds['left'] * $leftScale;
            $rightVisibleSrc = max(1, $rightBounds['right'] - $rightBounds['left'] + 1);
            $rightVisibleXInSlot = $rightBounds['left'] * $rightScale;

            $titleCanvasX = $bboxLeftPx + $leftFit[2] + $leftVisibleXInSlot;
            $titleCanvasWidth = $leftVisibleSrc * $leftScale;
            // End canvas X anchors backwards from the bbox right edge (or
            // the canvas right edge on the first-pass flow).
            $endCanvasX = $bboxRightPx - $rightWidth + $rightFit[2] + $rightVisibleXInSlot;
            $endCanvasWidth = $rightVisibleSrc * $rightScale;

            $metrics = [
                'title_stamp_left_pct' => $this->percentValue($titleCanvasX, $effectiveCanvasWidth),
                'title_stamp_width_pct' => $this->percentValue($titleCanvasWidth, $effectiveCanvasWidth),
                'end_stamp_left_pct' => $this->percentValue($endCanvasX, $effectiveCanvasWidth),
                'end_stamp_width_pct' => $this->percentValue($endCanvasWidth, $effectiveCanvasWidth),
            ];

            // Under the bilateral dynamic_content_stretch
            // override, the title and end PNGs are CONTAIN-fitted
            // into 1px-wide slots at the canvas edges so they read
            // as nearly-invisible specks. visibleBounds() still
            // returns their opaque minority (a few source pixels),
            // which would drive the live ticker's label overlay
            // (consumed as `title_stamp_*_pct` / `end_stamp_*_pct`
            // in resources/js/pages/ticker/show.tsx and
            // resources/js/components/ticker/theme-skin-preview.tsx)
            // to fit text into a hairline-wide rect. Zero the four
            // visible-stamp metrics so the consumer-side `typeof
            // === 'number' ? : fallback` chain takes the
            // "no visible stamp" branch cleanly. The fallback path
            // already exists (legacy themes without these fields),
            // so this stays consistent with how unmeasured themes
            // were always rendered.
            if ($dynamicContentStretch) {
                $metrics['title_stamp_left_pct'] = 0.0;
                $metrics['title_stamp_width_pct'] = 0.0;
                $metrics['end_stamp_left_pct'] = 0.0;
                $metrics['end_stamp_width_pct'] = 0.0;
            }

            if ($outputPng !== null) {
                File::ensureDirectoryExists(dirname($outputPng));

                $canvas = imagecreatetruecolor($effectiveCanvasWidth, max(1, $height));
                imagealphablending($canvas, false);
                imagesavealpha($canvas, true);
                $transparent = imagecolorallocatealpha($canvas, 0, 0, 0, 127);
                if ($transparent === false) {
                    imagedestroy($canvas);

                    return false;
                }
                imagefilledrectangle($canvas, 0, 0, $effectiveCanvasWidth, $height, $transparent);

                // Top-align all parts so the design forms a single horizontal
                // bar on the same y. Vertical centering would put shorter
                // parts (e.g. a wide-but-short content strip) at a
                // different y than the title/end, which looks broken in a
                // ticker. fitInBox() still computes the horizontal
                // centering offset via $leftFit[2] etc. so the parts stay
                // centered within their slot WIDTHS; we just ignore its
                // partY and pin everything to y=0.
                // Slots are anchored inside the bbox range, not at the
                // canvas edges, so artwork sits where the designer
                // dragged the handles and `dynamic_content_stretch`
                // collapses the end slot cleanly to the bbox right edge.
                if ($dynamicContentStretch) {
                    // Canvas-wide seamless-extend mode. The user's
                    // narrow 2D bbox is treated as a SOURCE-design
                    // hint rather than an OUTPUT constraint: all
                    // three parts are alpha-trimmed to their visible
                    // opaque sub-rectangles, then:
                    //   (i)  content.png tiles across the middle
                    //        region of the canvas between title slot
                    //        and end slot ($leftWidth .. $effCanvasW
                    //        - $rightWidth),
                    //   (ii) title.png is right-anchored inside the
                    //        title slot so its visible right edge
                    //        touches the first content tile seam,
                    //   (iii) end.png is left-anchored inside the
                    //        end slot so its visible left edge
                    //        touches the last content tile seam.
                    // The user explicitly stated content MUST lie
                    // before end (not straddle through end's slot),
                    // and these three layers guarantee that — end's
                    // slot is reserved for end.png only.
                    //
                    // ALL THREE inputs (leftImg/rightImg/middleImg)
                    // are produced by the cut stage
                    // (sliceFromSingle -> splitToTempPngs) and the
                    // original ungrown PNGs are also written to disk
                    // by the commit block earlier in this method, so
                    // re-edits + flag toggles keep the source PNGs.

                    // Alpha-trim content.png for clean tile seams.
                    $tileSource = $middleImg;
                    $tileIsCloned = false;
                    $midSrcW = imagesx($middleImg);
                    $midSrcH = imagesy($middleImg);
                    if (
                        $middleBounds['left'] > 0
                        || $middleBounds['top'] > 0
                        || $middleBounds['right'] < $midSrcW - 1
                        || $middleBounds['bottom'] < $midSrcH - 1
                    ) {
                        $cropped = imagecrop($middleImg, [
                            'x' => $middleBounds['left'],
                            'y' => $middleBounds['top'],
                            'width' => max(1, $middleBounds['right'] - $middleBounds['left'] + 1),
                            'height' => max(1, $middleBounds['bottom'] - $middleBounds['top'] + 1),
                        ]);
                        if ($cropped instanceof GdImage) {
                            imagealphablending($cropped, false);
                            imagesavealpha($cropped, true);
                            $tileSource = $cropped;
                            $tileIsCloned = true;
                        }
                    }

                    // Skip title/end alpha-trim: tighter sub-image
                    // fed into fitInBox('contain') pushes the visible
                    // artwork beyond the slot — the user reported
                    // flag=true as "no end at all", flag=false as
                    // "end visible". Match the unflagged path's
                    // "use source as-is" semantic so end is visible
                    // in both branches. Only content.png is
                    // alpha-trimmed (above) for clean tile seams.
                    $leftSource = $leftImg;
                    $rightSource = $rightImg;

                    // Bbox-anchored: tile bounds = bbox middle
                    // ($bboxLeftPx + $leftWidth ..
                    // $bboxRightPx - $rightWidth); outside-bbox canvas
                    // stays transparent. See commit history for the
                    // canvas-wide round that this replaced.
                    $tileSrcW = max(1, imagesx($tileSource));
                    $tileSrcH = max(1, imagesy($tileSource));
                    $scaledTileW = max(1, (int) round($tileSrcW * ($height / $tileSrcH)));

                    $tileStartX = $bboxLeftPx + $leftWidth;
                    $tileEndX = max($tileStartX, $bboxRightPx - $rightWidth);
                    if ($tileEndX > $tileStartX) {
                        // Fill left-to-right up to $tileEndX with no
                        // special-case last tile. The trailing visible
                        // tile is partial (left-clipped source) when the
                        // remaining space is shorter than $scaledTileW;
                        // $tileX advances by $drawW each iteration so
                        // the partial lands precisely at $tileEndX with
                        // no pixel gap before end.png's left edge. The
                        // previous round reserved a separate right-
                        // anchored full tile at the boundary which made
                        // the last visible tile a clean full repetition,
                        // but visually duplicated end.png's right-side
                        // chevron — the user reported that as "end is
                        // repeating" because the right-anchored last
                        // chevron-hybrid tile sat flush against end.png
                        // and read as a second end accent.
                        $tileX = $tileStartX;
                        while ($tileX < $tileEndX) {
                            $drawW = min($scaledTileW, $tileEndX - $tileX);
                            $isPartial = $drawW < $scaledTileW;
                            $srcClipW = $isPartial
                                ? max(1, (int) round($drawW * ($tileSrcW / $scaledTileW)))
                                : $tileSrcW;
                            imagecopyresampled(
                                $canvas, $tileSource, $tileX, 0, 0, 0,
                                $drawW, $height, $srcClipW, $tileSrcH,
                            );
                            $tileX += $drawW;
                        }
                    }

                    // Reuse outer-scope title/end fit (computed above
                    // the if-block for the metrics on UN-trimmed
                    // source dimensions) since title+end are NOT
                    // alpha-trimmed under this strategy ($leftSource
                    // === $leftImg, $rightSource === $rightImg). The
                    // outer $leftFit already does asymmetric
                    // right-anchor: $leftFit[2] = $leftWidth -
                    // $leftFit[0]. The outer $rightFit already does
                    // asymmetric left-anchor: $rightFit[2] = 0.
                    $leftFitW = $leftFit[0];
                    $leftFitH = $leftFit[1];
                    $leftBlitX = $bboxLeftPx + $leftWidth - $leftFitW;
                    $rightFitW = $rightFit[0];
                    $rightFitH = $rightFit[1];
                    $rightBlitX = $bboxRightPx - $rightWidth;

                    $this->blitResized($canvas, $leftSource, $leftBlitX, 0, $leftFitW, $leftFitH);
                    $this->blitResized($canvas, $rightSource, $rightBlitX, 0, $rightFitW, $rightFitH);

                    if ($tileIsCloned) {
                        imagedestroy($tileSource);
                    }
                } else {
                    $this->blitResized($canvas, $leftImg, $bboxLeftPx + $leftFit[2], 0, $leftFit[0], $leftFit[1]);
                    $this->blitResized($canvas, $middleImg, $bboxLeftPx + $leftWidth + $middleFit[2], 0, $middleFit[0], $middleFit[1]);
                    $this->blitResized(
                        $canvas,
                        $rightImg,
                        $bboxRightPx - $rightWidth + $rightFit[2],
                        0,
                        $rightFit[0],
                        $rightFit[1],
                    );
                }

                imagepng($canvas, $outputPng, 9);
                imagedestroy($canvas);
            }

            if ($outputJson !== null) {
                $meta = $metrics;
                if ($originalJson !== null && is_file($originalJson)) {
                    $existing = json_decode((string) file_get_contents($originalJson), true);
                    if (is_array($existing)) {
                        // Metrics win on conflict so the trim-based geometry
                        // always reflects the latest slice output.
                        $meta = array_merge($existing, $metrics);
                    }
                }

                // Recompile-cache marker: written whenever the
                // dynamic_content_stretch override fires under the
                // current single-blit-content strategy so
                // TickerStyleRepository::compileThemes() can detect
                // a SEMANTIC change across deploys (boolean flag
                // alone cannot see right-only → bilateral →
                // single-blit content). The marker key is
                // STRATEGY-NAMED — bump the suffix on every new
                // contract so previously-compiled metas are
                // guaranteed to recompile and never silently
                // serve a stale PNG for the same source flag.
                // Legacy compiled metas that carry dynamic=true
                // but lack the current strategy's marker key are
                // forced to recompile exactly once on the first
                // deploy — no manual `rm public/ticker-styles/
                // compiled/*` needed. On untoggle, the ELSE
                // branch explicitly unsets the marker so a
                // later re-toggle is observed by the cache
                // check; without the unset,
                // `array_merge($existing, $metrics)` would carry
                // the marker forward across the untoggle, masking
                // the re-toggle as a no-op and leaving stale
                // right-only-OFF-shrunken PNGs in place after
                // the artist flips the flag back on.
                if ($dynamicContentStretch) {
                    $meta['_compiled_under_dynamic_stretch_content_only_alpha_trim'] = true;
                } else {
                    unset($meta['_compiled_under_dynamic_stretch_content_only_alpha_trim']);
                }

                File::ensureDirectoryExists(dirname($outputJson));
                File::put(
                    $outputJson,
                    (string) json_encode($meta, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES).PHP_EOL,
                );
            }

            return $metrics;
        } finally {
            imagedestroy($leftImg);
            imagedestroy($middleImg);
            imagedestroy($rightImg);
        }
    }

    /**
     * Split a single source PNG/JPEG into three sub-PNGs at two X-coordinate
     * percentages of the source's natural width. Used by
     * {@see self::sliceFromSingle()} to turn the admin's single full-image
     * design into the three title/content/end inputs that {@see self::slice()}
     * already expects. The cut positions are converted from percentages to
     * pixels here so the caller can stay in resolution-independent coordinates.
     *
     * $split1 is the percentage where the title ends and content begins;
     * $split2 is where the content ends and the right accent begins.
     * $topPct, $bottomPct, $leftPct, $rightPct bound the 2D region of the
     * source that gets passed downstream — anything outside the bounding
     * box is cropped away here so the rest of the pipeline (CONTAIN-fit,
     * asymmetric anchoring, recompile) only ever sees the ticker-relevant
     * sub-rectangle. Splits and bbox are all absolute percentages of the
     * source's natural width/height (mouse positions on the unmodified
     * source artwork).
     *
     * The clamp at {@see self::MIN_SLOT_PIXELS} is a safety net — the
     * controller already enforces ≥1% slots via Laravel validation, but
     * rounding on very narrow sources could still produce zero-pixel
     * regions.
     *
     * Returns null on any GD failure; otherwise a map of temp file paths
     * plus the (post-crop) bbox dimensions of the active ticker sub-region
     * for the caller's reference.
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

            // Both cuts and bbox are absolute percentages of the source.
            // Default bbox (0/100) reproduces the pre-2D-crop behavior
            // exactly so the existing test fixtures continue to pass.
            $leftX = (int) round(($leftPct / 100) * $sourceWidth);
            $rightX = (int) round(($rightPct / 100) * $sourceWidth);
            $topY = (int) round(($topPct / 100) * $sourceHeight);
            $bottomY = (int) round(($bottomPct / 100) * $sourceHeight);

            if ($topY < 0) {
                $topY = 0;
            }
            if ($bottomY > $sourceHeight) {
                $bottomY = $sourceHeight;
            }
            if ($bottomY <= $topY + 1) {
                $bottomY = min($sourceHeight, $topY + 1);
            }
            if ($leftX < 0) {
                $leftX = 0;
            }
            if ($rightX > $sourceWidth) {
                $rightX = $sourceWidth;
            }
            if ($rightX <= $leftX + 1) {
                $rightX = min($sourceWidth, $leftX + 1);
            }

            $bboxWidth = $rightX - $leftX;
            $bboxHeight = $bottomY - $topY;

            // Splits are interpreted absolutely on source width — so the
            // title cut starts at $leftX (bbox-left) and the end cut ends at
            // $rightX (bbox-right). Splits outside the bbox are clamped to
            // its edges so GD never sees a zero-width slot.
            $cutX1 = (int) round(($split1 / 100) * $sourceWidth);
            $cutX2 = (int) round(($split2 / 100) * $sourceWidth);

            if ($cutX1 < $leftX + self::MIN_SLOT_PIXELS) {
                $cutX1 = $leftX + self::MIN_SLOT_PIXELS;
            }
            if ($cutX1 > $rightX - self::MIN_SLOT_PIXELS) {
                $cutX1 = $rightX - self::MIN_SLOT_PIXELS;
            }
            if ($cutX2 < $cutX1 + self::MIN_SLOT_PIXELS) {
                $cutX2 = $cutX1 + self::MIN_SLOT_PIXELS;
            }
            if ($cutX2 > $rightX - self::MIN_SLOT_PIXELS) {
                $cutX2 = $rightX - self::MIN_SLOT_PIXELS;
            }

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

            // imagecrop() returns a fresh GdImage that does not inherit
            // the source's alpha state; pin the flags here so the split
            // halves make it through the rest of the pipeline with their
            // transparency intact (see loadImage's docblock for context).
            imagealphablending($title, false);
            imagesavealpha($title, true);
            imagealphablending($middle, false);
            imagesavealpha($middle, true);
            imagealphablending($right, false);
            imagesavealpha($right, true);

            // PNG compression level 9 keeps temp file size small;
            // alpha values are unaffected by the compression level.
            imagepng($title, $tempDir.'/title.png', 9);
            imagepng($middle, $tempDir.'/content.png', 9);
            imagepng($right, $tempDir.'/end.png', 9);

            imagedestroy($title);
            imagedestroy($middle);
            imagedestroy($right);

            // Return the bbox dimensions (after 2D crop), not the raw source
            // dimensions, so downstream consumers know what the strips cover.
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
     * Build the temporary directory {@see self::sliceFromSingle()} owns for
     * the lifetime of one slice call. The random suffix keeps concurrent
     * requests from racing when the same host handles them in parallel.
     */
    private function newTempDir(): string
    {
        $path = sys_get_temp_dir().'/ticker-slice-'.Str::random(16);

        File::ensureDirectoryExists($path);

        return $path;
    }

    /**
     * Slice a single full-canvas image into a theme by first cutting it
     * into three title/content/end sub-images at two user-chosen X
     * percentages, then running the same pipeline as
     * {@see self::slice()}. The split is performed in a STemporary
     * directory owned by this call so callers don't have to manage the
     * file lifecycle themselves — every file written under it (split
     * halves and, when $returnPreview is true, the compiled preview PNG)
     * is removed once the call returns, even on GD failure.
     *
     * Two modes:
     *
     *  - **Commit mode** ($returnPreview=false): pass $themeDir and a
     *    canvas width. The three split halves flow through {@see self::slice()}
     *    which writes the trimmed title/content/end.png files into
     *    $themeDir (e.g. public/ticker-styles/{slug}/). The compiled
     *    {@slug}.png is generated lazily by
     *    {@see TickerStyleRepository::compileThemes()} on the next read,
     *    so we don't write it here.
     *
     *  - **Preview mode** ($returnPreview=true): skip $themeDir, write
     *    the compiled PNG to a temp file, and base64-encode it in the
     *    returned array so the caller can ship it as JSON without
     *    worrying about an artifact to clean up.
     *
     * $split1 is the percentage where the title ends and content begins,
     * $split2 is where the content ends and the right accent begins.
     * The controller validates that 0 < $split1 < $split2 < 100; if
     * somehow invalid inputs slip past validation, this method clamps
     * via {@see self::MIN_SLOT_PIXELS} and returns false rather than
     * crashing GD.
     *
     * @return array{
     *     title_stamp_left_pct: float,
     *     title_stamp_width_pct: float,
     *     end_stamp_left_pct: float,
     *     end_stamp_width_pct: float,
     *     preview_base64?: string
     * }|false
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
        // Tail-fill flag (see {self::slice()} for the runtime
        // override semantics). Forwarded to the inner slice() call so
        // the source-path commit/preview and the recompile path agree
        // on the same override behavior — without a shared flag the
        // first-pass commit could write a bbox-cropped strip while a
        // recompile would silently produce a canvas-wide one,
        // producing a strip-width jump on every theme re-edit.
        bool $dynamicContentStretch = false,
    ): array|false {
        $tempDir = $this->newTempDir();

        try {
            // Cut stage always uses the user's recorded split_1/split_2
            // — even when the artist's dynamic_content_stretch toggle
            // is on. The bilateral override lives entirely in slice()'s
            // slot math + the single-blit content blit further down
            // (see comment there). Routing the whole source into
            // content.png here was tried and reverted: it pulled
            // artwork the artist designed outside their recorded
            // cuts (e.g. an end accent placed mid-canvas or text at
            // x ≈ 60% of source width) into the visible strip where
            // it appeared as dramatically-stretched regions inside
            // the runtime-stretched content slot. With the cut
            // stage now bypassing the flag, content.png faithfully
            // captures ONLY the region between split_1 and split_2;
            // slice() stretches that narrow slice across the full
            // canvas and drops title/end from the rendered output
            // entirely.
            $split = $this->splitToTempPngs(
                $sourcePath,
                $split1,
                $split2,
                $tempDir,
                $topPct,
                $bottomPct,
                $leftPct,
                $rightPct,
            );
            if ($split === null) {
                return false;
            }

            $metrics = $this->slice(
                $split['left'],
                $split['middle'],
                $split['right'],
                $returnPreview ? null : $themeDir,
                $canvasWidth,
                $returnPreview ? $tempDir.'/preview.png' : null,
                null,
                null,
                // Forward the user's chosen splits + bbox so slice()
                // runs the bbox-aware recompile math on the very
                // first commit/preview. Without these, slice() falls
                // back to the legacy "proportional allocation" branch
                // which scales the bbox to fill 100% of the canvas —
                // a path that disagrees with the recompile path's
                // absolute-percentage math, so the live ticker (which
                // reads the persisted split_1/split_2 + bbox via
                // meta.json and positions the scrolling viewport with
                // `left: split_1%`) ends up scrolling text into the
                // slot the preview never intended. Forwarding the
                // percentages here aligns preview / first-pass commit
                // / recompile on a single coordinate system so the
                // theme-builder "Source parts" overlay, the preview
                // base64 PNG, the on-disk compiled PNG and the live
                // ticker all agree on the same split positions.
                [$split1, $split2],
                $leftPct,
                $rightPct,
                $dynamicContentStretch,
            );

            if (! is_array($metrics)) {
                return false;
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

        // imagecreatefromstring() does not enable alpha preservation by
        // default — the returned GdImage behaves as RGB and silently
        // drops any transparent / semi-transparent pixels when passed
        // to imagepng() or imagecopyresampled(). Without these two
        // flags, the source's designed transparent viewports and the
        // trim step's transparent padding would never reach the
        // compiled PNG.
        imagealphablending($image, false);
        imagesavealpha($image, true);

        return $image;
    }

    /**
     * Stamp the source image into a (slotWidth × slotHeight) box.
     * Two fit modes are supported:
     *
     *  - **stretch** (default): the source is rendered at the
     *    slot's exact pixel dimensions, ignoring the source's
     *    natural aspect ratio. Used for the middle "content"
     *    segment so it can grow/shrink with the user's dividers
     *    without leaving transparent gaps inside the slot.
     *
     *  - **contain**: the source is uniformly scaled with
     *    {@see min()} so the whole image fits inside the slot, then
     *    horizontally centered via $partX. Used for the left
     *    "title" and right "end" accents so logos / branding
     *    maintain their natural aspect instead of getting squashed
     *    when the slot ratio differs from the source ratio.
     *
     * Vertical offset is intentionally not returned: every part is
     * stamped from y=0 so the design forms a single horizontal bar
     * across all three slots. The "contain" parts end up shorter
     * than the slot height when their aspect ratio is wider than
     * the slot — that wasted vertical space is left transparent so
     * the CONTENT strip (which always stretches) can pick up the
     * slack without colliding with the centered logos.
     *
     * $srcW and $srcH remain in the signature for stability with
     * existing callers; under 'stretch' they are ignored, under
     * 'contain' they drive the scale.
     *
     * @param  string  $fitMode  'stretch' or 'contain'
     * @return array{0: int, 1: int, 2: int}
     */
    private function fitInBox(int $slotWidth, int $slotHeight, int $srcW, int $srcH, string $fitMode = 'stretch'): array
    {
        $slotWidth = max(1, $slotWidth);
        $slotHeight = max(1, $slotHeight);
        $srcW = max(1, $srcW);
        $srcH = max(1, $srcH);

        if ($fitMode === 'contain') {
            $scale = min($slotWidth / $srcW, $slotHeight / $srcH);
            $newW = max(1, (int) round($srcW * $scale));
            $newH = max(1, (int) round($srcH * $scale));
            $partX = (int) round(($slotWidth - $newW) / 2);

            return [$newW, $newH, $partX];
        }

        $newW = $slotWidth;
        $newH = $slotHeight;
        $partX = 0;

        return [$newW, $newH, $partX];
    }

    /**
     * Find the alpha-trim (visible-opaque) bounding box of an image.
     * Two-pass scan of every pixel's alpha channel: a pixel counts as
     * "visible" when its alpha is below the fully-transparent threshold
     * (`SDL_ALPHA_OPAQUE` is 0 in GD's reversed encoding, where 0 means
     * fully opaque and 127 means fully transparent). The returned rect
     * runs inside the image's natural coordinate system, [0..imagesx−1]
     * × [0..imagesy−1], and is empty-but-fallback when the source is
     * fully transparent: the function never returns `right < 0` or
     * `bottom < 0` because that would degrade the math
     * {@see self::slice()} runs against these bounds.
     *
     * Pixel-by-pixel alpha scan stays cheap for typical theme asset
     * sizes — a dusk title.png is 286×121 (~35k pixels) and the compiled
     * PNG is at most 1920×150 (~288k pixels) — well within a single
     * request budget. Sources larger than that should probably not be
     * sent through the ticker slicer anyway.
     *
     * Pixels whose alpha equals 127 (fully transparent per GD's
     * encoding) are filtered out so the live ticker label sits over
     * the artwork the user actually sees. Half-transparent pixels
     * (alpha < 127) are kept so intentional soft edges, gradients, and
     * anti-aliasing still bound the visible region.
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
                // GD's packed color is the same encoding as
                // imagecolorallocatealpha(): bits 24..31 hold alpha in
                // the range 0 (opaque) .. 127 (fully transparent).
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
            // Fully transparent source — nothing to anchor to. Fall
            // back to the full bounding box so the slot math doesn't
            // collapse to a 1×1 degenerate stamp.
            return ['left' => 0, 'right' => $width - 1, 'top' => 0, 'bottom' => $height - 1];
        }

        return ['left' => $left, 'right' => $right, 'top' => $top, 'bottom' => $bottom];
    }

    /**
     * Convert a canvas-relative pixel offset (or width) into a
     * percentage of the canvas width, returned as a floating-point
     * number with four decimals of precision. Using a plain float
     * rather than a '%'-suffixed string keeps the metric directly
     * portable to JS (`${value}%`), JSON (numeric), and any future
     * downstream tooling that doesn't speak CSS percentage strings.
     */
    private function percentValue(float $pixels, float $canvasWidth): float
    {
        if ($canvasWidth <= 0) {
            return 0.0;
        }

        // Clamp the pixel position to the canvas range so an out-of-range
        // value renders as 0% or 100% rather than relying on the JS
        // consumer to defensively clamp later. A source shorter than
        // its target slot could otherwise produce a negative offset
        // (no: pixel values are integers).
        $clamped = max(0.0, min($canvasWidth, (float) $pixels));

        return round(($clamped / $canvasWidth) * 100, 4);
    }

    private function blitResized(
        GdImage $canvas,
        GdImage $source,
        int $dstX,
        int $dstY,
        int $dstWidth,
        int $dstHeight,
    ): void {
        $sourceWidth = max(1, imagesx($source));
        $sourceHeight = max(1, imagesy($source));

        imagecopyresampled(
            $canvas,
            $source,
            $dstX,
            $dstY,
            0,
            0,
            $dstWidth,
            $dstHeight,
            $sourceWidth,
            $sourceHeight,
        );
    }
}
