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

    public function __construct(private ThemeImageSlicer $themeImageSlicer) {}

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

            try {
                $themes[] = $this->styleFromThemeDirectory($item);
            } catch (\Throwable $exception) {
                report($exception);
            }
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
        $fetched = $this->fetchThemeArchiveFromUrl($url);

        try {
            return $this->importThemeArchive(
                $fetched['archivePath'],
                basename((string) (parse_url($url, PHP_URL_PATH) ?: 'theme.zip')),
            );
        } finally {
            File::delete($fetched['archivePath']);
        }
    }

    /**
     * Stream a theme archive from a URL to a temporary file and pull its
     * metadata, without ever extracting PNG/JSON assets onto the filesystem.
     * Lets callers decide what to do with the archive (e.g. queue it for
     * moderation instead of publishing it locally).
     *
     * Same-host share URLs bypass HTTP entirely via {@see resolveLocalSharePath}.
     *
     * @return array{archivePath: string, slug: string, label: string, author: string|null}
     */
    public function fetchThemeArchiveFromUrl(string $url): array
    {
        $tempPath = tempnam(sys_get_temp_dir(), 'theme-import-');
        if ($tempPath === false) {
            throw new \RuntimeException('Unable to create a temporary download file.');
        }

        $archivePath = $tempPath.'.zip';
        File::delete($tempPath);

        // Bypass HTTP when the URL is a share file on this same host.
        $localSharePath = $this->resolveLocalSharePath($url);
        if ($localSharePath !== null) {
            File::copy($localSharePath, $archivePath);
        } else {
            try {
                $response = Http::connectTimeout(10)
                    ->timeout(120)
                    ->retry(3, 2000)
                    ->sink($archivePath)
                    ->get($url);
            } catch (\Throwable $exception) {
                @unlink($archivePath);

                throw new \RuntimeException('The theme URL could not be downloaded (network error or timeout).');
            }

            if (! $response->successful()) {
                @unlink($archivePath);

                throw new \RuntimeException('The theme URL could not be downloaded (HTTP '.$response->status().').');
            }
        }

        return [
            'archivePath' => $archivePath,
            ...$this->readThemeArchiveMetadata($archivePath),
        ];
    }

    /**
     * Read the metadata (slug, label, author) of a theme archive without
     * extracting any of its image assets. Throws when the archive is missing
     * or malformed so the caller can surface a friendly validation error.
     *
     * @return array{slug: string, label: string, author: string|null}
     */
    public function readThemeArchiveMetadata(string $absolutePath): array
    {
        if (! is_file($absolutePath)) {
            throw new \RuntimeException('The theme archive could not be opened.');
        }

        $zip = new ZipArchive;
        if ($zip->open($absolutePath) !== true) {
            throw new \RuntimeException('The theme archive must be a valid .zip file.');
        }

        try {
            $jsonEntry = $this->findZipJsonEntry($zip);
            if (! $jsonEntry) {
                throw new \RuntimeException('The archive is missing the theme JSON file.');
            }

            $themeData = json_decode($this->zipEntryContents($zip, $jsonEntry), true);
            if (! is_array($themeData)) {
                throw new \RuntimeException('The theme JSON file must contain valid JSON.');
            }

            $fallbackName = pathinfo(basename(str_replace('\\', '/', $jsonEntry)), PATHINFO_FILENAME);
            $themeSlug = $this->normalizeThemeSlug(
                $themeData['theme_name'] ?? $fallbackName,
            );
            if ($themeSlug === '') {
                throw new \RuntimeException('The JSON file name or theme_name value must contain a valid theme name.');
            }

            $author = isset($themeData['author']) && is_string($themeData['author']) && trim($themeData['author']) !== ''
                ? trim($themeData['author'])
                : null;
            $label = isset($themeData['name']) && is_string($themeData['name']) && trim((string) $themeData['name']) !== ''
                ? trim((string) $themeData['name'])
                : $this->themeLabelFromSlug($themeSlug);

            return [
                'slug' => $themeSlug,
                'label' => $label,
                'author' => $author,
            ];
        } finally {
            $zip->close();
        }
    }

    /**
     * Decide whether the theme URL points at a share file we can read directly
     * from disk (avoids a server-to-self HTTP roundtrip). Returns the absolute
     * storage path when the file is on the same host and matches the public
     * share endpoint; throws a RuntimeException for any other same-host URL;
     * returns null when the URL is on a different host so the caller can fall
     * back to an HTTP download.
     */
    private function resolveLocalSharePath(string $url): ?string
    {
        $expectedHost = $this->resolveExpectedHost();
        if ($expectedHost === '') {
            return null;
        }

        $urlHost = parse_url($url, PHP_URL_HOST);
        if (! is_string($urlHost)) {
            return null;
        }

        if (strcasecmp($urlHost, $expectedHost) !== 0) {
            return null;
        }

        $urlPath = parse_url($url, PHP_URL_PATH);
        if (! is_string($urlPath) || $urlPath !== '/share-theme') {
            throw new \RuntimeException('Only public share URLs from this host are allowed.');
        }

        $urlQuery = parse_url($url, PHP_URL_QUERY);
        if (! is_string($urlQuery) || preg_match(
            '/(?:^|&)uuid=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:&|$)/',
            $urlQuery,
            $matches,
        ) !== 1) {
            throw new \RuntimeException('Only public share URLs from this host are allowed.');
        }

        $localPath = storage_path('app/private/theme-shares/'.$matches[1].'.zip');
        if (! is_file($localPath)) {
            throw new \RuntimeException('The share file is no longer available.');
        }

        return $localPath;
    }

    private function resolveExpectedHost(): string
    {
        $host = request()->getHost();
        if ($host !== '') {
            return $host;
        }

        $appUrlHost = parse_url((string) config('app.url'), PHP_URL_HOST);

        return is_string($appUrlHost) ? $appUrlHost : '';
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

    /**
     * @return array{id: string, path: string, filename: string}
     */
    public function createShareZip(string $slug): array
    {
        $themeSlug = $this->normalizeThemeSlug($slug);
        if ($themeSlug === '') {
            throw new \RuntimeException('The theme slug is invalid.');
        }

        $archivePath = $this->createThemeZip($themeSlug);
        $shareDirectory = storage_path('app/private/theme-shares');
        File::ensureDirectoryExists($shareDirectory);

        $shareId = (string) Str::uuid();
        $sharePath = $shareDirectory.'/'.$shareId.'.zip';
        File::copy($archivePath, $sharePath);
        File::delete($archivePath);

        return [
            'id' => $shareId,
            'path' => $sharePath,
            'filename' => $themeSlug.'.zip',
        ];
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

            // Read the source meta.json once and share the decoded
            // value between the cache-bust comparison (below) and
            // the recompile body (further below). Re-decoding in
            // both code paths would double the file I/O on every
            // cache miss and risk subtle drift if the artist
            // writes the file mid-compile. `(string) "..."` coerces
            // a read failure to an empty string (which json_decode
            // rejects as null); the is_array gate then collapses
            // that to an empty array so a missing/malformed source
            // doesn't crash the compile cascade.
            $sourceMeta = json_decode((string) file_get_contents($themeJson), true);
            if (! is_array($sourceMeta)) {
                $sourceMeta = [];
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

                // The dynamic-content-stretch override in slice() is
                // runtime-only — re-toggling the flag in the source
                // meta.json must not stencil the user's recorded
                // split_2/right_pct, so the mtime-only guard above
                // cannot detect a standalone flag flip on a theme
                // whose source PNGs are otherwise untouched. Compare
                // the flag baked into the previously-compiled
                // meta.json against the current value in $sourceMeta
                // (loaded once at the top of the theme iteration); on
                // mismatch, force a recompile so the PNG physically
                // reflects the new override state. Legacy compiled
                // meta.jsons written before this field existed
                // default to `false` here, which trips the expected
                // one-shot recompile the first time an artist enables
                // the override on a previously-compiled theme. The
                // (bool) cast treats absent / null as `false` on both
                // sides so the comparison resolves to a mismatch
                // only when the artist actually toggled the flag.
                //
                // Override-shape detection: comparing the boolean
                // alone misses SEMANTIC changes to the override
                // across deploys (right-only → bilateral →
                // single-blit content is itself invisible to a
                // flag comparison). ThemeImageSlicer writes the
                // strategy-named
                // `_compiled_under_dynamic_stretch_single_blit`
                // marker into compiled meta.json whenever the
                // override fires under the current single-blit
                // strategy, so a one-shot recompile is forced
                // here for any theme that carries `dynamic=true`
                // in source meta but the previously-compiled
                // meta lacks the marker key for the current
                // strategy. The marker key is bumped on every
                // strategy change (the previous bilateral-cut-
                // stage strategy wrote a different key,
                // `_compiled_under_dynamic_override`) — without
                // that, a deploy that changes the override's
                // behavior would leave previously-compiled
                // themes' PNGs frozen at the older semantics
                // and serve them after the new contract lands.
                if (! $needsCompile) {
                    $compiledMeta = json_decode(
                        (string) file_get_contents($outputJson),
                        true,
                    );
                    $sourceDynamic = (bool) ($sourceMeta['dynamic_content_stretch'] ?? false);
                    $compiledDynamic = is_array($compiledMeta)
                        ? (bool) ($compiledMeta['dynamic_content_stretch'] ?? false)
                        : false;
                    if ($sourceDynamic !== $compiledDynamic) {
                        $needsCompile = true;
                    } elseif (
                        $sourceDynamic
                        && is_array($compiledMeta)
                        && ! array_key_exists('_compiled_under_dynamic_stretch_single_blit', $compiledMeta)
                    ) {
                        // Legacy transition: the compiled meta was
                        // produced either before the current
                        // strategy landed OR under an older
                        // strategy whose marker key differs.
                        // Force a one-shot recompile; the next
                        // write will carry the current strategy's
                        // marker and stay in sync until the
                        // artist actually toggles the flag again.
                        $needsCompile = true;
                    }
                }

                if ($needsCompile) {
                    try {
                        // Re-alias the source meta.json (loaded once at
                        // the top of the theme iteration) so the rest
                        // of the recompile body keeps its existing
                        // $themeMeta callsite contract. The defensive
                        // is_array fallback to [] already happened in
                        // the shared decode above; a redundant fall-
                        // through here would only mask a missing-file
                        // edge case the cache check already covers.
                        $themeMeta = $sourceMeta;

                        // The committed theme's meta.json records the user's
                        // originally-chosen split percentages. The first-pass
                        // commit flow persists UN-trimmed cut-region PNGs
                        // (designer-baked transparent gutters/fades inside
                        // each cut are intentional space, preserved by
                        // CONTAIN-fit + asymmetric anchoring), so the
                        // recompile slot math MUST use those percentages;
                        // otherwise imagesx() returns the cut-region
                        // dimensions including transparent padding and the
                        // slot boundaries sit on transparent canvas.

                        $splitPercentages = null;
                        $augmented = false;
                        $bboxLeftPct = null;
                        $bboxRightPct = null;

                        if (isset($themeMeta['split_1'], $themeMeta['split_2'])
                            && is_numeric($themeMeta['split_1'])
                            && is_numeric($themeMeta['split_2'])) {
                            $splitPercentages = [
                                (float) $themeMeta['split_1'],
                                (float) $themeMeta['split_2'],
                            ];
                            // Read the bbox so slice() can anchor the slot
                            // math inside the painted bbox instead of the
                            // full canvas. Legacy themes without bbox
                            // fields fall back to null, which slice() maps
                            // to canvas-edge-to-canvas-edge anchoring for
                            // backwards compatibility.
                            $bboxLeftPct = (isset($themeMeta['left_pct']) && is_numeric($themeMeta['left_pct']))
                                ? (float) $themeMeta['left_pct']
                                : null;
                            $bboxRightPct = (isset($themeMeta['right_pct']) && is_numeric($themeMeta['right_pct']))
                                ? (float) $themeMeta['right_pct']
                                : null;
                        } else {
                            // WYCIWYG: if a legacy theme's meta.json lacks the
                            // split percentages, derive them from the actual
                            // pixel widths of the title/content/end PNGs so
                            // the live ticker's CSS-percent layout matches
                            // the compiled PNG's geometric boundaries
                            // exactly. The derived splits are written into
                            // the compiled meta copy so subsequent
                            // recompiles read them back as recorded-splits
                            // and skip the derivation step.
                            $derived = $this->deriveSplitsFromCutImages(
                                $titleFile,
                                $contentFile,
                                $endFile,
                            );
                            if ($derived !== null) {
                                $themeMeta['split_1'] = $derived[0];
                                $themeMeta['split_2'] = $derived[1];
                                $themeMeta['top_pct'] ??= 0.0;
                                $themeMeta['bottom_pct'] ??= 100.0;
                                $themeMeta['left_pct'] = 0.0;
                                $themeMeta['right_pct'] = 100.0;
                                $splitPercentages = $derived;
                                $augmented = true;
                            }
                        }

                        $sliceMetrics = $this->themeImageSlicer->slice(
                            $titleFile,
                            $contentFile,
                            $endFile,
                            null,
                            null,
                            $outputPng,
                            null,
                            null,
                            $splitPercentages,
                            $bboxLeftPct,
                            $bboxRightPct,
                            // Tail-fill on the recompile path: when the
                            // user toggled dynamic_content_stretch=true
                            // in their source meta.json, force the
                            // recompile to paint the strip all the way
                            // to canvas right (see ThemeImageSlicer
                            // ::slice() for the math override). The
                            // runtime-only override keeps the source
                            // meta's split_2 / right_pct intact for
                            // re-edit-ability when the flag is toggled
                            // off in the builder.
                            (bool) ($themeMeta['dynamic_content_stretch'] ?? false),
                        );

                        // Persist the visible-stamp metrics the slicer
                        // computed so the live ticker can read them from
                        // meta.json and place its label overlay exactly
                        // on the visible stamp area (post-CONTAIN-fit +
                        // asymmetric anchoring). Without these, the live
                        // renderer falls back to the source slot
                        // boundaries ([left_pct, split_1]) which describe
                        // the SLOT, not the STAMP — and any title art
                        // whose aspect ratio differs from the slot
                        // renders its label over transparent padding
                        // rather than over the actual visible image.
                        $persistedMetrics = is_array($sliceMetrics)
                            ? array_intersect_key(
                                $sliceMetrics,
                                array_flip([
                                    'title_stamp_left_pct',
                                    'title_stamp_width_pct',
                                    'end_stamp_left_pct',
                                    'end_stamp_width_pct',
                                ]),
                            )
                            : [];

                        if ($persistedMetrics !== []) {
                            // Metric keys win on conflict so a recompile
                            // that re-reads an older meta.json still
                            // refreshes the visible-stamp geometry.
                            $themeMeta = array_merge($themeMeta, $persistedMetrics);
                        }

                        // Always emit the merged JSON on every recompile
                        // so legacy meta.json files migrated through this
                        // path pick up the new metrics without waiting for
                        // a user re-export. The augmented flag still
                        // controls whether the source meta's split fields
                        // were filled in by deriveSplitsFromCutImages;
                        // either way the file we write is the merged
                        // view, not a verbatim copy.
                        File::put(
                            $outputJson,
                            (string) json_encode($themeMeta, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES).PHP_EOL,
                        );

                        $this->deleteLegacyCompiledFiles($item);
                    } catch (\Throwable $exception) {
                        report($exception);
                    }
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

    /**
     * Derive split_1 / split_2 percentages for a legacy theme whose
     * meta.json was written before the build flow started recording
     * them. Reads the actual pixel widths of the title, content and
     * end cut-images via getimagesize() (cheap, no GD decode) and
     * returns [split_1, split_2] as floating-point percentages of
     * the total source width, suitable for use as the
     * `$splitPercentages` argument of
     * {@see ThemeImageSlicer::slice()} and for persistence to the
     * compiled meta.json.
     *
     * WYCIWYG: this guarantees the live ticker's CSS-percent slots
     * match the compiled PNG's exact geometric boundaries when no
     * user-recorded splits are available, eliminating the previous
     * hardcoded 13%/5% fallback in the renderer.
     *
     * @return array{0: float, 1: float}|null
     */
    private function deriveSplitsFromCutImages(
        string $titlePath,
        string $contentPath,
        string $endPath,
    ): ?array {
        $titleSize = @getimagesize($titlePath);
        $contentSize = @getimagesize($contentPath);
        $endSize = @getimagesize($endPath);

        if ($titleSize === false || $contentSize === false || $endSize === false) {
            return null;
        }

        $titleWidth = max(1, (int) $titleSize[0]);
        $contentWidth = max(1, (int) $contentSize[0]);
        $endWidth = max(1, (int) $endSize[0]);
        // Each width is clamped to >=1 above so $total is always >=3,
        // which makes the percentage computation safe.
        $total = $titleWidth + $contentWidth + $endWidth;
        $split1 = round(($titleWidth / $total) * 100, 4);
        $split2 = round($split1 + ($contentWidth / $total) * 100, 4);

        return [(float) $split1, (float) $split2];
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
