<?php

namespace App\Services;

use GdImage;
use Illuminate\Support\Facades\File;

class ThemeImageStitcher
{
    /**
     * @return array{
     *     custom_label_left: string,
     *     custom_label_width: string,
     *     custom_viewport_left: string,
     *     custom_viewport_right: string
     * }|false
     */
    public function stitch(
        string $leftPath,
        string $middlePath,
        string $rightPath,
        ?string $outputPng = null,
        ?string $outputJson = null,
        ?string $themeJson = null,
    ): array|false {
        $leftImg = $this->loadImage($leftPath);
        $middleImg = $this->loadImage($middlePath);
        $rightImg = $this->loadImage($rightPath);

        if (! $leftImg || ! $middleImg || ! $rightImg) {
            return false;
        }

        $leftImg = $this->cropTransparentMargins($leftImg);
        $middleImg = $this->cropTransparentMargins($middleImg);
        $rightImg = $this->cropTransparentMargins($rightImg);

        $totalWidth = 1920;
        $height = max(
            32,
            min(
                512,
                max(imagesy($leftImg), imagesy($middleImg), imagesy($rightImg)),
            ),
        );

        $leftWidth = $this->scaledWidth($leftImg, $height);
        $rightWidth = $this->scaledWidth($rightImg, $height);

        $maxPartWidth = (int) ($totalWidth * 0.4);
        if ($leftWidth > $maxPartWidth) {
            $leftWidth = $maxPartWidth;
        }
        if ($rightWidth > $maxPartWidth) {
            $rightWidth = $maxPartWidth;
        }

        $middleWidth = max(1, $totalWidth - $leftWidth - $rightWidth);

        if ($outputPng !== null) {
            $stitchedImg = imagecreatetruecolor($totalWidth, $height);
            imagealphablending($stitchedImg, false);
            imagesavealpha($stitchedImg, true);
            $transparent = imagecolorallocatealpha($stitchedImg, 0, 0, 0, 127);
            if ($transparent !== false) {
                imagefill($stitchedImg, 0, 0, $transparent);
            }
            imagealphablending($stitchedImg, true);

            imagecopyresampled($stitchedImg, $leftImg, 0, 0, 0, 0, $leftWidth, $height, imagesx($leftImg), imagesy($leftImg));
            imagecopyresampled($stitchedImg, $middleImg, $leftWidth, 0, 0, 0, $middleWidth, $height, imagesx($middleImg), imagesy($middleImg));
            imagecopyresampled($stitchedImg, $rightImg, $totalWidth - $rightWidth, 0, 0, 0, $rightWidth, $height, imagesx($rightImg), imagesy($rightImg));

            imagepng($stitchedImg, $outputPng);
            imagedestroy($stitchedImg);
        }

        $metrics = [
            'custom_label_left' => '0%',
            'custom_label_width' => round(($leftWidth / $totalWidth) * 100, 4).'%',
            'custom_viewport_left' => round(($leftWidth / $totalWidth) * 100, 4).'%',
            'custom_viewport_right' => round(($rightWidth / $totalWidth) * 100, 4).'%',
        ];

        if ($outputJson !== null) {
            $meta = $metrics;

            if ($themeJson !== null && is_file($themeJson)) {
                $originalData = json_decode((string) file_get_contents($themeJson), true);
                if (is_array($originalData)) {
                    $meta = array_merge($meta, $originalData);
                }
            }

            File::put($outputJson, (string) json_encode($meta, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES).PHP_EOL);
        }

        imagedestroy($leftImg);
        imagedestroy($middleImg);
        imagedestroy($rightImg);

        return $metrics;
    }

    private function loadImage(string $path): GdImage|false
    {
        $contents = file_get_contents($path);
        if ($contents === false) {
            return false;
        }

        return imagecreatefromstring($contents);
    }

    private function cropTransparentMargins(GdImage $image): GdImage
    {
        $bounds = $this->visibleBounds($image);
        if ($bounds === null) {
            return $image;
        }

        if ($bounds['x'] === 0
            && $bounds['y'] === 0
            && $bounds['width'] === imagesx($image)
            && $bounds['height'] === imagesy($image)) {
            return $image;
        }

        $cropped = imagecrop($image, $bounds);

        if ($cropped instanceof GdImage) {
            imagedestroy($image);

            return $cropped;
        }

        return $image;
    }

    /**
     * @return array{x: int, y: int, width: int, height: int}|null
     */
    private function visibleBounds(GdImage $image): ?array
    {
        $width = imagesx($image);
        $height = imagesy($image);

        $minX = $width;
        $minY = $height;
        $maxX = -1;
        $maxY = -1;

        for ($y = 0; $y < $height; $y++) {
            for ($x = 0; $x < $width; $x++) {
                if ($this->isTransparentPixel($image, $x, $y)) {
                    continue;
                }

                if ($x < $minX) {
                    $minX = $x;
                }
                if ($y < $minY) {
                    $minY = $y;
                }
                if ($x > $maxX) {
                    $maxX = $x;
                }
                if ($y > $maxY) {
                    $maxY = $y;
                }
            }
        }

        if ($maxX < 0 || $maxY < 0) {
            return null;
        }

        return [
            'x' => $minX,
            'y' => $minY,
            'width' => $maxX - $minX + 1,
            'height' => $maxY - $minY + 1,
        ];
    }

    private function isTransparentPixel(GdImage $image, int $x, int $y): bool
    {
        $color = imagecolorat($image, $x, $y);
        if (! is_int($color)) {
            return true;
        }

        return (($color >> 24) & 0x7F) === 127;
    }

    private function scaledWidth(GdImage $image, int $height): int
    {
        $sourceHeight = max(1, imagesy($image));

        return max(1, (int) round(imagesx($image) * ($height / $sourceHeight)));
    }
}
