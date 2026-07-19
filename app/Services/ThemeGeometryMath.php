<?php

namespace App\Services;

/**
 * Pure-math geometry helpers for theme slicing.
 *
 * No GD, no file I/O, no side effects. Testable in isolation. The
 * expensive work (alpha-trim, blit, fit) lives in ThemeImageSlicer;
 * this class is the easy static-math layer that callers can poke at
 * with arbitrary percentage inputs and verify against in unit tests.
 *
 * Extracted 2026-07-18 as part of the slice-process rewrite: the prior
 * implementation embedded ~80 lines of slot-position math + visible-bound
 * math + cache-hash math inline in slice(). Splitting it here means the
 * slot math has exactly one source of truth, and slot-canvas-rect units
 * can be tested without spinning up GD.
 */
class ThemeGeometryMath
{
    /**
     * Convert (left, split1, split2, right) percentages on a canvas of
     * given width into exact pixel rectangles for the three slots.
     *
     * Defensive clamping ensures out-of-order or out-of-range percentages
     * never produce negative widths — the slot renderer can rely on every
     * returned width being >= 1.
     *
     * @param  int  $canvasWidth  Target canvas width (caller-resolved: defaults
     *                            to ThemeImageSlicer::DEFAULT_CANVAS_WIDTH = 1920).
     * @param  float  $leftPct  Source-bbox left edge as percentage of canvas
     *                          width (0 .. 100).
     * @param  float  $split1Pct  x-coordinate of cut 2 (title→content divider).
     * @param  float  $split2Pct  x-coordinate of cut 3 (content→end divider).
     * @param  float  $rightPct  Source-bbox right edge as percentage of canvas
     *                           width (0 .. 100).
     * @return array{
     *     title: array{x: int, width: int},
     *     content: array{x: int, width: int},
     *     end: array{x: int, width: int},
     *     canvas_width: int
     * }
     */
    public static function calculateSlots(
        int $canvasWidth,
        float $leftPct,
        float $split1Pct,
        float $split2Pct,
        float $rightPct,
    ): array {
        $canvasWidth = max(1, $canvasWidth);

        $bboxLeftPx = (int) round(($leftPct / 100.0) * $canvasWidth);
        $split1Px = (int) round(($split1Pct / 100.0) * $canvasWidth);
        $split2Px = (int) round(($split2Pct / 100.0) * $canvasWidth);
        $bboxRightPx = (int) round(($rightPct / 100.0) * $canvasWidth);

        // Defensive clamps: split1 must sit inside the bbox range; split2
        // must sit at-or-after split1. These were the historical "out-of-order
        // percentage" failure mode that got baked into a 10-line sequence of
        // max() clamps inside slice(). Pulled out here so it's testable.
        $split1Px = max($bboxLeftPx, min($split1Px, $bboxRightPx));
        $split2Px = max($split1Px, min($split2Px, $bboxRightPx));

        $titleWidth = max(1, $split1Px - $bboxLeftPx);
        $contentWidth = max(1, $split2Px - $split1Px);
        $endWidth = max(1, $bboxRightPx - $split2Px);

        return [
            'title' => ['x' => $bboxLeftPx, 'width' => $titleWidth],
            'content' => ['x' => $split1Px, 'width' => $contentWidth],
            'end' => ['x' => $split2Px, 'width' => $endWidth],
            'canvas_width' => $canvasWidth,
        ];
    }

    /**
     * Convert a canvas-relative pixel offset into a percentage of canvas
     * width. Used by ThemeImageSlicer to emit the four title_stamp_*_pct
     * / end_stamp_*_pct metrics consumed by show.tsx.
     */
    public static function percentValue(float $pixels, int $canvasWidth): float
    {
        if ($canvasWidth <= 0) {
            return 0.0;
        }

        $clamped = max(0.0, min((float) $canvasWidth, $pixels));

        return round(($clamped / $canvasWidth) * 100, 4);
    }
}
