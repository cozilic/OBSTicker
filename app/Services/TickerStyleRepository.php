<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use ZipArchive;

class TickerStyleRepository
{
    public const BASE_DIRECTORY = 'ticker-styles';

    public const COMPILED_DIRECTORY = 'ticker-styles/compiled';

    /**
     * @return list<array{value: string, label: string, url: string}>
     */
    public function all(): array
    {
        return array_map(
            fn (array $theme): array => [
                'value' => $theme['value'],
                'label' => $theme['label'],
                'url' => $theme['url'],
            ],
            $this->allDetailed(),
        );
    }

    /**
     * @return list<array{slug: string, value: string, label: string, url: string, author: string|null}>
     */
    public function allDetailed(): array
    {
        $this->compileThemes();

        if (! is_dir($this->baseDirectory())) {
            return [];
        }

        $directories = scandir($this->baseDirectory()) ?: [];
        $themes = [];

        foreach ($directories as $item) {
            if (! $this->isThemeDirectory($item)) {
                continue;
            }

            $themes[] = $this->styleFromThemeDirectory($item);
        }

        usort($themes, static fn (array $left, array $right): int => $left['label'] <=> $right['label']);

        return $themes;
    }

    /**
     * @return array{
     *     data: list<array{slug: string, value: string, label: string, url: string, author: string|null, downloadUrl: string}>,
     *     links: list<array{url: string|null, label: string, active: bool}>,
     *     meta: array{
     *         current_page: int,
     *         from: int|null,
     *         last_page: int,
     *         path: string,
     *         per_page: int,
     *         to: int|null,
     *         total: int,
     *         first_page_url: string|null,
     *         last_page_url: string|null,
     *         next_page_url: string|null,
     *         prev_page_url: string|null
     *     }
     * }
     */
    public function paginateDetailed(int $perPage = 10, ?int $page = null): array
    {
        $themes = array_map(
            fn (array $theme): array => [
                ...$theme,
                'downloadUrl' => route('ticker.themes.share.download', ['theme' => $theme['slug']]),
            ],
            $this->allDetailed(),
        );
        $currentPage = max(1, $page ?? LengthAwarePaginator::resolveCurrentPage());

        $paginator = new LengthAwarePaginator(
            array_slice($themes, ($currentPage - 1) * $perPage, $perPage),
            count($themes),
            $perPage,
            $currentPage,
            [
                'path' => LengthAwarePaginator::resolveCurrentPath(),
                'pageName' => 'page',
            ],
        );

        return [
            'data' => array_slice($themes, ($currentPage - 1) * $perPage, $perPage),
            'links' => [],
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'from' => $paginator->firstItem(),
                'last_page' => $paginator->lastPage(),
                'path' => $paginator->path(),
                'per_page' => $paginator->perPage(),
                'to' => $paginator->lastItem(),
                'total' => $paginator->total(),
                'first_page_url' => $paginator->url(1),
                'last_page_url' => $paginator->url($paginator->lastPage()),
                'next_page_url' => $paginator->nextPageUrl(),
                'prev_page_url' => $paginator->previousPageUrl(),
            ],
        ];
    }

    /**
     * @return array{slug: string, value: string, label: string, url: string, author: string|null}|null
     */
    public function findDetailed(string $slug): ?array
    {
        $normalizedSlug = $this->normalizeThemeSlug($slug);
        if ($normalizedSlug === '') {
            return null;
        }

        foreach ($this->allDetailed() as $theme) {
            if ($theme['slug'] === $normalizedSlug) {
                return $theme;
            }
        }

        return null;
    }

    public function existsTheme(string $slug): bool
    {
        $normalizedSlug = $this->normalizeThemeSlug($slug);

        return $normalizedSlug !== ''
            && is_dir($this->themeDirectory($normalizedSlug))
            && is_file($this->themeJsonPath($normalizedSlug));
    }

    /**
     * @return array{slug: string, label: string, author: string|null}
     */
    public function importThemeZip(UploadedFile $archive): array
    {
        return $this->importThemeArchive(
            $archive->getRealPath() ?: $archive->getPathname(),
            $archive->getClientOriginalName(),
        );
    }

    /**
     * @return array{slug: string, label: string, author: string|null}
     */
    public function importThemeUrl(string $url): array
    {
        $response = Http::timeout(15)->get($url);
        if (! $response->successful()) {
            throw new \RuntimeException('The theme URL could not be downloaded.');
        }

        $tempPath = tempnam(sys_get_temp_dir(), 'theme-import-');
        if ($tempPath === false) {
            throw new \RuntimeException('Unable to create a temporary download file.');
        }

        $archivePath = $tempPath.'.zip';
        File::delete($tempPath);
        File::put($archivePath, $response->body());

        try {
            return $this->importThemeArchive(
                $archivePath,
                basename((string) (parse_url($url, PHP_URL_PATH) ?: 'theme.zip')),
            );
        } finally {
            File::delete($archivePath);
        }
    }

    public function createThemeZip(string $slug): string
    {
        $themeSlug = $this->normalizeThemeSlug($slug);
        if ($themeSlug === '') {
            throw new \RuntimeException('The theme slug is invalid.');
        }

        $themeDir = $this->themeDirectory($themeSlug);
        $themeJson = $this->themeJsonPath($themeSlug);
        if (! is_dir($themeDir) || ! is_file($themeJson)) {
            throw new \RuntimeException('The theme could not be found.');
        }

        $tempPath = tempnam(sys_get_temp_dir(), 'theme-share-');
        if ($tempPath === false) {
            throw new \RuntimeException('Unable to create a temporary archive.');
        }

        $archivePath = $tempPath.'.zip';
        File::delete($tempPath);

        $zip = new ZipArchive;
        if ($zip->open($archivePath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new \RuntimeException('Unable to create the theme archive.');
        }

        try {
            $titleFile = $this->findImageFile($themeDir, 'title');
            $contentFile = $this->findImageFile($themeDir, 'content');
            $endFile = $this->findImageFile($themeDir, 'end');

            if (! $titleFile || ! $contentFile || ! $endFile) {
                throw new \RuntimeException('The theme is missing required image files.');
            }

            $zip->addFile($titleFile, 'title.png');
            $zip->addFile($contentFile, 'content.png');
            $zip->addFile($endFile, 'end.png');
            $zip->addFile($themeJson, $themeSlug.'.json');
        } finally {
            $zip->close();
        }

        return $archivePath;
    }

    public function createShareZip(string $slug): string
    {
        $themeSlug = $this->normalizeThemeSlug($slug);
        if ($themeSlug === '') {
            throw new \RuntimeException('The theme slug is invalid.');
        }

        $archivePath = $this->createThemeZip($themeSlug);
        $shareDirectory = public_path('ticker-theme-shares');
        File::ensureDirectoryExists($shareDirectory);

        $sharePath = $shareDirectory.'/'.$themeSlug.'.zip';
        File::copy($archivePath, $sharePath);
        File::delete($archivePath);

        return $sharePath;
    }

    public function shareZipUrl(string $slug): ?string
    {
        $themeSlug = $this->normalizeThemeSlug($slug);
        if ($themeSlug === '') {
            return null;
        }

        $sharePath = public_path('ticker-theme-shares/'.$themeSlug.'.zip');
        if (! is_file($sharePath)) {
            return null;
        }

        return '/ticker-theme-shares/'.rawurlencode($themeSlug.'.zip');
    }

    /**
     * @return array{slug: string, label: string, author: string|null}
     */
    private function importThemeArchive(string $archivePath, string $originalName): array
    {
        $zip = new ZipArchive;
        if ($zip->open($archivePath) !== true) {
            throw new \RuntimeException('Unable to open the theme archive.');
        }

        $titleEntry = $this->findZipEntry($zip, 'title.png');
        $contentEntry = $this->findZipEntry($zip, 'content.png');
        $endEntry = $this->findZipEntry($zip, 'end.png');
        $jsonEntry = $this->findZipJsonEntry($zip);

        if (! $titleEntry || ! $contentEntry || ! $endEntry || ! $jsonEntry) {
            $zip->close();

            throw new \RuntimeException('The archive must contain title.png, content.png, end.png, and a matching JSON file.');
        }

        $themeData = json_decode($this->zipEntryContents($zip, $jsonEntry), true);
        if (! is_array($themeData)) {
            $zip->close();

            throw new \RuntimeException('The theme JSON file must contain valid JSON.');
        }

        $themeSlug = $this->normalizeThemeSlug(
            $themeData['theme_name'] ?? pathinfo(basename(str_replace('\\', '/', $originalName)), PATHINFO_FILENAME),
        );
        if ($themeSlug === '') {
            $zip->close();

            throw new \RuntimeException('The JSON file name or theme_name value must contain a valid theme name.');
        }

        File::deleteDirectory($this->themeDirectory($themeSlug));
        File::delete($this->compiledThemePngPath($themeSlug));
        File::delete($this->compiledThemeJsonPath($themeSlug));
        $this->deleteLegacyCompiledFiles($themeSlug);

        $themeDir = $this->themeDirectory($themeSlug);
        File::ensureDirectoryExists($themeDir);

        File::put($themeDir.'/title.png', $this->zipEntryContents($zip, $titleEntry));
        File::put($themeDir.'/content.png', $this->zipEntryContents($zip, $contentEntry));
        File::put($themeDir.'/end.png', $this->zipEntryContents($zip, $endEntry));

        $author = isset($themeData['author']) && is_string($themeData['author']) && trim($themeData['author']) !== ''
            ? trim($themeData['author'])
            : null;
        $themeData['theme_name'] = $themeSlug;
        $themeData['author'] = $author;
        $themeData['created_at'] = isset($themeData['created_at']) && is_string($themeData['created_at']) && trim($themeData['created_at']) !== ''
            ? trim($themeData['created_at'])
            : null;
        if (! isset($themeData['name']) || trim((string) $themeData['name']) === '') {
            $themeData['name'] = $this->themeLabelFromSlug($themeSlug);
        }

        File::put(
            $this->themeJsonPath($themeSlug),
            (string) json_encode($themeData, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES).PHP_EOL,
        );

        $zip->close();

        $this->all();

        return [
            'slug' => $themeSlug,
            'label' => (string) $themeData['name'],
            'author' => $author,
        ];
    }

    public function deleteTheme(string $slug): void
    {
        $themeSlug = $this->normalizeThemeSlug($slug);
        if ($themeSlug === '') {
            return;
        }

        File::delete($this->compiledThemePngPath($themeSlug));
        File::delete($this->compiledThemeJsonPath($themeSlug));
        File::deleteDirectory($this->themeDirectory($themeSlug));
        File::delete(public_path('ticker-theme-shares/'.$themeSlug.'.zip'));
        $this->deleteLegacyCompiledFiles($themeSlug);
    }

    private function compileThemes(): void
    {
        $baseDir = $this->baseDirectory();
        if (! is_dir($baseDir)) {
            return;
        }

        File::ensureDirectoryExists($this->compiledDirectory());

        $items = scandir($baseDir) ?: [];
        foreach ($items as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }

            $themeDir = $baseDir.'/'.$item;
            if (! is_dir($themeDir)) {
                continue;
            }

            $themeJson = $this->themeJsonPath($item);
            if (! is_file($themeJson)) {
                continue;
            }

            $titleFile = $this->findImageFile($themeDir, 'title');
            $contentFile = $this->findImageFile($themeDir, 'content');
            $endFile = $this->findImageFile($themeDir, 'end');

            if ($titleFile && $contentFile && $endFile) {
                $outputPng = $this->compiledThemePngPath($item);
                $outputJson = $this->compiledThemeJsonPath($item);

                $needsCompile = ! is_file($outputPng) || ! is_file($outputJson);
                if (! $needsCompile) {
                    $pngMtime = filemtime($outputPng);
                    if (filemtime($titleFile) > $pngMtime ||
                        filemtime($contentFile) > $pngMtime ||
                        filemtime($endFile) > $pngMtime ||
                        filemtime($themeJson) > $pngMtime) {
                        $needsCompile = true;
                    }
                }

                if ($needsCompile) {
                    $this->stitchTheme($titleFile, $contentFile, $endFile, $outputPng, $outputJson, $themeJson);
                    $this->deleteLegacyCompiledFiles($item);
                }
            }
        }
    }

    private function findImageFile(string $dir, string $name): ?string
    {
        $extensions = ['png', 'PNG', 'jpg', 'JPG', 'jpeg', 'JPEG'];
        foreach ($extensions as $ext) {
            $path = $dir.'/'.$name.'.'.$ext;
            if (is_file($path)) {
                return $path;
            }
        }

        return null;
    }

    private function stitchTheme(string $leftPath, string $middlePath, string $rightPath, string $outputPng, string $outputJson, string $themeJson): bool
    {
        $leftImg = imagecreatefromstring((string) file_get_contents($leftPath));
        $middleImg = imagecreatefromstring((string) file_get_contents($middlePath));
        $rightImg = imagecreatefromstring((string) file_get_contents($rightPath));

        if (! $leftImg || ! $middleImg || ! $rightImg) {
            return false;
        }

        $totalWidth = 1920;
        $height = imagesy($leftImg);

        $height = max(32, min(512, $height));

        $origLeftWidth = imagesx($leftImg);
        $origLeftHeight = imagesy($leftImg);
        $leftWidth = (int) round($origLeftWidth * ($height / $origLeftHeight));

        $origRightWidth = imagesx($rightImg);
        $origRightHeight = imagesy($rightImg);
        $rightWidth = (int) round($origRightWidth * ($height / $origRightHeight));

        $maxPartWidth = (int) ($totalWidth * 0.4);
        if ($leftWidth > $maxPartWidth) {
            $leftWidth = $maxPartWidth;
        }
        if ($rightWidth > $maxPartWidth) {
            $rightWidth = $maxPartWidth;
        }

        $middleWidth = $totalWidth - $leftWidth - $rightWidth;

        $stitchedImg = imagecreatetruecolor($totalWidth, $height);
        imagealphablending($stitchedImg, false);
        imagesavealpha($stitchedImg, true);
        $transparent = imagecolorallocatealpha($stitchedImg, 0, 0, 0, 127);
        if ($transparent !== false) {
            imagefill($stitchedImg, 0, 0, $transparent);
        }
        imagealphablending($stitchedImg, true);

        imagecopyresampled($stitchedImg, $leftImg, 0, 0, 0, 0, $leftWidth, $height, $origLeftWidth, $origLeftHeight);
        imagecopyresampled($stitchedImg, $middleImg, $leftWidth, 0, 0, 0, $middleWidth, $height, imagesx($middleImg), imagesy($middleImg));
        imagecopyresampled($stitchedImg, $rightImg, $totalWidth - $rightWidth, 0, 0, 0, $rightWidth, $height, $origRightWidth, $origRightHeight);

        imagepng($stitchedImg, $outputPng);

        imagedestroy($leftImg);
        imagedestroy($middleImg);
        imagedestroy($rightImg);
        imagedestroy($stitchedImg);

        $customLabelLeft = '0%';
        $customLabelWidth = round(($leftWidth / $totalWidth) * 100, 4).'%';
        $customViewportLeft = round(($leftWidth / $totalWidth) * 100, 4).'%';
        $customViewportRight = round(($rightWidth / $totalWidth) * 100, 4).'%';

        $meta = [
            'custom_label_left' => $customLabelLeft,
            'custom_label_width' => $customLabelWidth,
            'custom_viewport_left' => $customViewportLeft,
            'custom_viewport_right' => $customViewportRight,
        ];
        if (is_file($themeJson)) {
            $originalData = json_decode((string) file_get_contents($themeJson), true);
            if (is_array($originalData)) {
                $meta = array_merge($meta, $originalData);
            }
        }

        file_put_contents($outputJson, (string) json_encode($meta, JSON_PRETTY_PRINT));

        return true;
    }

    public function exists(string $filename): bool
    {
        if (! $this->isSafePngFilename($filename)) {
            return false;
        }

        return is_file($this->compiledDirectory().'/'.$filename)
            || is_file($this->baseDirectory().'/'.$filename);
    }

    public function url(?string $filename): ?string
    {
        if ($filename === null || ! $this->exists($filename)) {
            return null;
        }

        if (is_file($this->compiledDirectory().'/'.$filename)) {
            return '/'.self::COMPILED_DIRECTORY.'/'.rawurlencode($filename);
        }

        return '/'.self::BASE_DIRECTORY.'/'.rawurlencode($filename);
    }

    private function isThemeDirectory(string $item): bool
    {
        if ($item === '.' || $item === '..' || str_starts_with($item, '.')) {
            return false;
        }

        return is_dir(public_path('ticker-styles/'.$item))
            && is_file(public_path('ticker-styles/'.$item.'/'.$item.'.json'));
    }

    /**
     * @return array{slug: string, value: string, label: string, url: string, author: string|null}
     */
    private function styleFromThemeDirectory(string $directory): array
    {
        $label = $this->themeLabelFromSlug($directory);

        $outputJson = $this->themeJsonPath($directory);
        $author = $this->themeAuthorFromDirectory($directory);
        if (is_file($outputJson)) {
            $meta = json_decode((string) file_get_contents($outputJson), true);
            if (is_array($meta) && isset($meta['name'])) {
                $label = (string) $meta['name'];
            }
            if (is_array($meta) && array_key_exists('author', $meta)) {
                $author = is_string($meta['author']) && trim($meta['author']) !== '' ? trim($meta['author']) : $author;
            }
        }

        return [
            'slug' => $directory,
            'value' => $directory.'.png',
            'label' => $label,
            'url' => '/'.self::COMPILED_DIRECTORY.'/'.rawurlencode($directory.'.png'),
            'author' => $author,
        ];
    }

    private function isSafePngFilename(string $filename): bool
    {
        return $filename === basename($filename)
            && Str::of($filename)->lower()->endsWith('.png');
    }

    private function baseDirectory(): string
    {
        return public_path(self::BASE_DIRECTORY);
    }

    private function compiledDirectory(): string
    {
        return public_path(self::COMPILED_DIRECTORY);
    }

    private function themeDirectory(string $slug): string
    {
        return $this->baseDirectory().'/'.$slug;
    }

    private function themeJsonPath(string $slug): string
    {
        return $this->themeDirectory($slug).'/'.$slug.'.json';
    }

    private function compiledThemePngPath(string $slug): string
    {
        return $this->compiledDirectory().'/'.$slug.'.png';
    }

    private function compiledThemeJsonPath(string $slug): string
    {
        return $this->compiledDirectory().'/'.$slug.'.json';
    }

    private function normalizeThemeSlug(string $value): string
    {
        return Str::slug(trim($value));
    }

    private function themeLabelFromSlug(string $slug): string
    {
        return Str::of($slug)->replace(['-', '_'], ' ')->headline()->toString();
    }

    private function themeAuthorFromDirectory(string $slug): ?string
    {
        $themeJson = $this->themeJsonPath($slug);
        if (is_file($themeJson)) {
            $meta = json_decode((string) file_get_contents($themeJson), true);
            if (is_array($meta) && isset($meta['author']) && is_string($meta['author']) && trim($meta['author']) !== '') {
                return trim($meta['author']);
            }
        }

        return null;
    }

    private function findZipEntry(ZipArchive $zip, string $expectedBasename): ?string
    {
        $expected = Str::lower($expectedBasename);

        for ($index = 0; $index < $zip->numFiles; $index++) {
            $name = $zip->getNameIndex($index);
            if ($name === false || str_ends_with($name, '/')) {
                continue;
            }

            $basename = Str::lower(basename(str_replace('\\', '/', $name)));
            if ($basename === $expected) {
                return $name;
            }
        }

        return null;
    }

    private function findZipJsonEntry(ZipArchive $zip): ?string
    {
        for ($index = 0; $index < $zip->numFiles; $index++) {
            $name = $zip->getNameIndex($index);
            if ($name === false || str_ends_with($name, '/')) {
                continue;
            }

            if (Str::lower(pathinfo(basename(str_replace('\\', '/', $name)), PATHINFO_EXTENSION)) === 'json') {
                return $name;
            }
        }

        return null;
    }

    private function deleteLegacyCompiledFiles(string $slug): void
    {
        File::delete($this->baseDirectory().'/'.$slug.'.png');
        File::delete($this->baseDirectory().'/'.$slug.'.json');
    }

    private function zipEntryContents(ZipArchive $zip, string $entry): string
    {
        $contents = $zip->getFromName($entry);
        if ($contents === false) {
            throw new \RuntimeException("Unable to read {$entry} from the archive.");
        }

        return $contents;
    }
}
