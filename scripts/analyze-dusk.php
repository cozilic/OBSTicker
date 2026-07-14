<?php

declare(strict_types=1);

$path = '/tmp/dusk.png';
$img = imagecreatefrompng($path);
if (! $img) {
    fwrite(STDERR, "Could not load $path\n");
    exit(1);
}

$w = imagesx($img);
$h = imagesy($img);
echo "Dimensions: {$w}x{$h}\n\n";

// 1. Per-row and per-column "opaque-ness" (any pixel with alpha < 127 = opaque-ish).
//    We bin by 16 pixels to keep the output readable.
$colHasOpaque = array_fill(0, $w, false);
$rowHasOpaque = array_fill(0, $h, false);
$totalPixels = $w * $h;
$opaquePixels = 0;
$alphaHistogram = array_fill(0, 8, 0); // 0-15, 16-31, ..., 112-127

for ($y = 0; $y < $h; $y++) {
    for ($x = 0; $x < $w; $x++) {
        $color = imagecolorat($img, $x, $y);
        $alpha = ($color >> 24) & 0x7F;
        $alphaHistogram[(int) floor($alpha / 16)]++;
        if ($alpha < 127) {
            $opaquePixels++;
            $colHasOpaque[$x] = true;
            $rowHasOpaque[$y] = true;
        }
    }
}

echo "Total pixels: {$totalPixels}\n";
echo "Fully-opaque (alpha<127): {$opaquePixels}  (".round(($opaquePixels / $totalPixels) * 100, 2)."%)\n\n";
echo "Alpha histogram (0=opaque, 127=fully transparent):\n";
foreach ($alphaHistogram as $i => $count) {
    $low = $i * 16;
    $high = $i * 16 + 15;
    $label = $low === 0 ? 'opaque' : ($high >= 127 ? 'fully transparent' : 'partial');
    printf("  alpha %3d-%3d (%-18s): %8d  (%5.2f%%)\n", $low, $high, $label, $count, ($count / $totalPixels) * 100);
}
echo "\n";

// 2. Bounding box of all visible content.
$minX = array_search(true, $colHasOpaque, true);
$maxX = $w - 1 - array_search(true, array_reverse($colHasOpaque, true), true);
$minY = array_search(true, $rowHasOpaque, true);
$maxY = $h - 1 - array_search(true, array_reverse($rowHasOpaque, true), true);

echo "Visible-content bbox: x=[{$minX}..{$maxX}] y=[{$minY}..{$maxY}]  (size ".($maxX - $minX + 1).'x'.($maxY - $minY + 1).")\n\n";

// 3. Section-by-section: left (0-768), middle (768-1678), right (1678-1920).
//    For each, report its visible bbox and how much of the slot is empty.
$sections = [
    'LEFT  (0..767)'   => [0, 767],
    'MIDDLE(768..1677)'=> [768, 1677],
    'RIGHT (1678..1919)'=> [1678, 1919],
];

foreach ($sections as $label => [$x0, $x1]) {
    $slotW = $x1 - $x0 + 1;
    $colsHere = array_slice($colHasOpaque, $x0, $slotW);
    $rowsInSlot = array_fill(0, $h, false);
    $slotOpaque = 0;
    for ($y = 0; $y < $h; $y++) {
        for ($x = $x0; $x <= $x1; $x++) {
            $color = imagecolorat($img, $x, $y);
            $alpha = ($color >> 24) & 0x7F;
            if ($alpha < 127) {
                $slotOpaque++;
                $rowsInSlot[$y] = true;
            }
        }
    }
    $firstCol = array_search(true, $colsHere, true);
    $lastCol = $slotW - 1 - array_search(true, array_reverse($colsHere, true), true);
    $firstRow = array_search(true, $rowsInSlot, true);
    $lastRow = $h - 1 - array_search(true, array_reverse($rowsInSlot, true), true);

    $colFillPct = $firstCol === false ? 0.0 : (count(array_filter($colsHere)) / $slotW) * 100;
    $visibleW = $firstCol === false ? 0 : ($lastCol - $firstCol + 1);
    $visibleH = $firstRow === false ? 0 : ($lastRow - $firstRow + 1);

    echo "=== {$label}  ({$slotW}px wide) ===\n";
    if ($firstCol === false) {
        echo "  ENTIRELY TRANSPARENT — no visible pixels at all.\n\n";

        continue;
    }
    printf("  Visible bbox inside slot: x=[%d..%d] (visible width %dpx), y=[%d..%d] (visible height %dpx)\n",
        $firstCol, $lastCol, $visibleW, $firstRow, $lastRow, $visibleH);
    printf("  Visible width = %.2f%% of slot\n", ($visibleW / $slotW) * 100);
    printf("  Column fill   = %.2f%% of slot (opaque columns / total columns)\n", $colFillPct);
    printf("  Opaque pixels = %d (%.2f%% of section)\n", $slotOpaque, ($slotOpaque / ($slotW * $h)) * 100);
    echo "\n";
}

// 4. Empty column runs inside each section (suggests the source image was
//    smaller than the slot and got centered/left-aligned with transparency).
echo "=== Empty column runs (transparent gaps >= 16px) inside the full image ===\n";
$inRun = false;
$runStart = 0;
$runLen = 0;
for ($x = 0; $x < $w; $x++) {
    if (! $colHasOpaque[$x]) {
        if (! $inRun) {
            $inRun = true;
            $runStart = $x;
            $runLen = 0;
        }
        $runLen++;
    } else {
        if ($inRun && $runLen >= 16) {
            printf("  x=[%d..%d]  (%dpx transparent run)\n", $runStart, $runStart + $runLen - 1, $runLen);
        }
        $inRun = false;
    }
}
if ($inRun && $runLen >= 16) {
    printf("  x=[%d..%d]  (%dpx transparent run)\n", $runStart, $runStart + $runLen - 1, $runLen);
}

echo "\n=== Empty row runs (transparent gaps >= 4px) inside the full image ===\n";
$inRun = false;
$runStart = 0;
$runLen = 0;
for ($y = 0; $y < $h; $y++) {
    if (! $rowHasOpaque[$y]) {
        if (! $inRun) {
            $inRun = true;
            $runStart = $y;
            $runLen = 0;
        }
        $runLen++;
    } else {
        if ($inRun && $runLen >= 4) {
            printf("  y=[%d..%d]  (%dpx transparent run)\n", $runStart, $runStart + $runLen - 1, $runLen);
        }
        $inRun = false;
    }
}
if ($inRun && $runLen >= 4) {
    printf("  y=[%d..%d]  (%dpx transparent run)\n", $runStart, $runStart + $runLen - 1, $runLen);
}

imagedestroy($img);
