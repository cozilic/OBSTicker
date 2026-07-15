import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { fitTextToWidth } from '@/lib/text';
import { cn } from '@/lib/utils';

type SampleItem = {
    headline: string;
    text: string;
};

type ThemeSkinPreviewProps = {
    imageUrl: string;
    metaUrl?: string;
    items: SampleItem[];
    cycleMs?: number;
    className?: string;
    onMetaLoaded?: (meta: ThemeMeta | null) => void;
    /**
     * Render the preview as just the lower-third ticker strip instead
     * of the full 16:9 canvas. Used on the admin theme-preview page
     * where the empty 94% above the strip adds nothing — the user
     * wants to verify "does this theme look right on air", not "does
     * this PNG look right as a thumbnail". The HUD overlay (LIVE
     * PREVIEW badge + playback controls + dot indicator) is hidden in
     * compact mode because there's no canvas above the strip to put
     * it on. The container's aspect is the strip's natural aspect
     * (~30:1 for a 16:9 canvas, ~22:1 for 4:3) so the WHOLE strip
     * fills the box — title stamp + content slot + end stamp are all
     * visible at their natural width. The compiled PNG is scaled to
     * fit the container's width and anchored to the bottom so the
     * strip area (the bottom 6% of the PNG) is what you see.
     */
    compact?: boolean;
};

export type ThemeMeta = {
    split_1: number;
    split_2: number;
    left_pct: number;
    right_pct: number;
    top_pct: number;
    bottom_pct: number;
    title_stamp_left_pct?: number;
    title_stamp_width_pct?: number;
    end_stamp_left_pct?: number;
    end_stamp_width_pct?: number;
    label_left_pct?: number;
    label_width_pct?: number;
    label_top_pct?: number;
    label_height_pct?: number;
    dynamic_content_stretch?: boolean;
};

const PREVIEW_CANVAS = {
    width: 1920,
    height: 1080,
} as const;

const SCROLL_STYLE_BLOCK = `
@keyframes ticker-skin-scroll-preview {
  from { transform: translateX(105%); }
  to { transform: translateX(-105%); }
}
.ticker-skin-scroll-preview-track {
  animation: ticker-skin-scroll-preview 22s linear infinite;
  will-change: transform;
}
.ticker-skin-scroll-preview-track[data-paused="true"] {
  animation-play-state: paused;
}
@media (prefers-reduced-motion: reduce) {
  .ticker-skin-scroll-preview-track {
    animation-duration: 60s;
  }
}
`;

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

function projectLabelBox(themeMeta: ThemeMeta | null) {
    // Mirrors the `manualLabelBox` projection in
    // resources/js/pages/ticker/show.tsx (source-percent -> compiled-percent),
    // so a theme previewed here matches the on-air layout pixel-for-pixel
    // aside from the canvas-aspect container (preview is rendered at the
    // screen's aspect ratio, not the broadcaster's exact canvas).
    if (themeMeta === null) {
        return null;
    }

    if (
        typeof themeMeta.label_left_pct !== 'number' ||
        typeof themeMeta.label_width_pct !== 'number' ||
        typeof themeMeta.label_top_pct !== 'number' ||
        typeof themeMeta.label_height_pct !== 'number'
    ) {
        return null;
    }

    const titleSourceRange = Math.max(
        0.01,
        themeMeta.split_1 - themeMeta.left_pct,
    );
    const titleStampWidth =
        typeof themeMeta.title_stamp_width_pct === 'number'
            ? themeMeta.title_stamp_width_pct
            : titleSourceRange;
    const titleStampLeft =
        typeof themeMeta.title_stamp_left_pct === 'number'
            ? themeMeta.title_stamp_left_pct
            : themeMeta.left_pct;

    const left = clamp(
        titleStampLeft +
            ((themeMeta.label_left_pct - themeMeta.left_pct) /
                titleSourceRange) *
                titleStampWidth,
        0,
        100,
    );
    const width = clamp(
        (themeMeta.label_width_pct / titleSourceRange) * titleStampWidth,
        0,
        100,
    );

    const verticalRange = Math.max(
        0.01,
        themeMeta.bottom_pct - themeMeta.top_pct,
    );
    const top = clamp(
        ((themeMeta.label_top_pct - themeMeta.top_pct) / verticalRange) * 100,
        0,
        100,
    );
    const height = clamp(
        (themeMeta.label_height_pct / verticalRange) * 100,
        0,
        100,
    );

    return { left, top, width, height };
}

function viewportSlotStyle(themeMeta: ThemeMeta | null): {
    left: string;
    right: string;
} {
    if (themeMeta === null) {
        return { left: '13%', right: '5%' };
    }

    // When dynamic_content_stretch is on, the content slot extends all
    // the way to the bounding-box right edge and the end region has
    // zero width. Mirrors ticker/show.tsx's `defaultSkinTickerViewportStyle`
    // branch so the on-air rendering matches the preview.
    if (themeMeta.dynamic_content_stretch === true) {
        return {
            left: `${themeMeta.split_1}%`,
            right: `${Math.max(0, 100 - themeMeta.right_pct)}%`,
        };
    }

    return {
        left: `${themeMeta.split_1}%`,
        right: `${Math.max(0, 100 - themeMeta.split_2)}%`,
    };
}

export default function ThemeSkinPreview({
    imageUrl,
    metaUrl,
    items,
    cycleMs = 7000,
    className,
    onMetaLoaded,
    compact = false,
}: ThemeSkinPreviewProps) {
    const [themeMeta, setThemeMeta] = useState<ThemeMeta | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [viewportScale, setViewportScale] = useState(1);
    // The strip's natural aspect (width / height) is computed from
    // the real PNG in the useEffect below. `null` means "not yet
    // measured" — the container falls back to `aspect-[30/1]` (a
    // safe 16:9 default) for the first frame so there's no flash of
    // an empty container while the probe is in flight. Once
    // measured, the inline `aspectRatio` style overrides the
    // className and the strip frames edge-to-edge regardless of the
    // theme's canvas aspect (16:9, 4:3, 21:9, etc.).
    const [compactAspect, setCompactAspect] = useState<number | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    const resolvedMetaUrl = useMemo(() => {
        if (typeof metaUrl === 'string' && metaUrl !== '') {
            return metaUrl;
        }

        return imageUrl.replace(/\.png(?=$|\?)/, '.json');
    }, [imageUrl, metaUrl]);

    // Fetch the meta.json that the live ticker fetches so the preview
    // is WYCIWYG: same projection math, same fallback layers, same
    // graceful degradation when the meta is missing.
    useEffect(() => {
        if (typeof resolvedMetaUrl !== 'string' || resolvedMetaUrl === '') {
            return undefined;
        }

        const controller = new AbortController();

        void fetch(resolvedMetaUrl, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        })
            .then((response) => (response.ok ? response.json() : null))
            .then((data: unknown) => {
                if (controller.signal.aborted) {
                    return;
                }

                if (data === null || typeof data !== 'object') {
                    setThemeMeta(null);
                    onMetaLoaded?.(null);

                    return;
                }

                const record = data as Partial<ThemeMeta>;

                if (
                    typeof record.split_1 !== 'number' ||
                    typeof record.split_2 !== 'number'
                ) {
                    setThemeMeta(null);
                    onMetaLoaded?.(null);

                    return;
                }

                const resolved: ThemeMeta = {
                    split_1: record.split_1,
                    split_2: record.split_2,
                    left_pct:
                        typeof record.left_pct === 'number'
                            ? record.left_pct
                            : 0,
                    right_pct:
                        typeof record.right_pct === 'number'
                            ? record.right_pct
                            : 100,
                    top_pct:
                        typeof record.top_pct === 'number' ? record.top_pct : 0,
                    bottom_pct:
                        typeof record.bottom_pct === 'number'
                            ? record.bottom_pct
                            : 100,
                    title_stamp_left_pct:
                        typeof record.title_stamp_left_pct === 'number'
                            ? record.title_stamp_left_pct
                            : undefined,
                    title_stamp_width_pct:
                        typeof record.title_stamp_width_pct === 'number'
                            ? record.title_stamp_width_pct
                            : undefined,
                    end_stamp_left_pct:
                        typeof record.end_stamp_left_pct === 'number'
                            ? record.end_stamp_left_pct
                            : undefined,
                    end_stamp_width_pct:
                        typeof record.end_stamp_width_pct === 'number'
                            ? record.end_stamp_width_pct
                            : undefined,
                    label_left_pct:
                        typeof record.label_left_pct === 'number'
                            ? record.label_left_pct
                            : undefined,
                    label_width_pct:
                        typeof record.label_width_pct === 'number'
                            ? record.label_width_pct
                            : undefined,
                    label_top_pct:
                        typeof record.label_top_pct === 'number'
                            ? record.label_top_pct
                            : undefined,
                    label_height_pct:
                        typeof record.label_height_pct === 'number'
                            ? record.label_height_pct
                            : undefined,
                    dynamic_content_stretch:
                        typeof record.dynamic_content_stretch === 'boolean'
                            ? record.dynamic_content_stretch
                            : undefined,
                };

                setThemeMeta(resolved);
                onMetaLoaded?.(resolved);
            })
            .catch(() => {
                if (controller.signal.aborted) {
                    return;
                }

                setThemeMeta(null);
                onMetaLoaded?.(null);
            });

        return (): void => {
            controller.abort();
        };
    }, [resolvedMetaUrl, onMetaLoaded]);

    // Cycle the sample items. Pause + reduce-motion keep the experience
    // calm; the active index is the only piece of state driving the
    // headline + ticker text + dot-indicator row.
    useEffect(() => {
        if (items.length < 2 || isPaused) {
            return undefined;
        }

        const timer = window.setInterval(() => {
            setActiveIndex((current) => (current + 1) % items.length);
        }, cycleMs);

        return (): void => {
            window.clearInterval(timer);
        };
    }, [items.length, cycleMs, isPaused]);

    // Measure the source PNG so the compact container's aspect ratio
    // matches the strip's natural aspect. Loading the image into a
    // throwaway <img> is cheap (browser-decoded only, never inserted
    // into the DOM) and lets us adapt to any canvas aspect (16:9,
    // 4:3, 21:9) without hardcoding. The strip is the bottom 6% of
    // the canvas height, so its aspect = naturalWidth /
    // (naturalHeight * 0.06). Only runs in compact mode — in the
    // full-canvas 16:9 mode the aspect-video className is enough.
    // Starts at `null` so the first render falls back to the
    // `aspect-[30/1]` className (a safe 16:9 default) and avoids a
    // flash of an empty container while the probe is in flight.
    useEffect(() => {
        if (!compact || typeof imageUrl !== 'string' || imageUrl === '') {
            return;
        }

        const probe = new Image();
        probe.onload = () => {
            if (probe.naturalHeight > 0) {
                setCompactAspect(
                    probe.naturalWidth / (probe.naturalHeight * 0.06),
                );
            }
        };
        probe.onerror = () => {
            // Keep the default aspect; the container will use the
            // aspect-[30/1] className fallback for the rest of its
            // life if the PNG never resolves.
        };
        probe.src = imageUrl;

        return (): void => {
            probe.onload = null;
            probe.onerror = null;
            // Abort any pending decode so the in-flight request
            // doesn't resolve against a dead component after the
            // effect's dependencies change.
            probe.src = '';
        };
    }, [imageUrl, compact]);

    // Track viewport-relative scale so the headline + ticker text fit
    // proportionally inside the responsive container. The math is the
    // same shape as ticker/show.tsx's viewportScale clamp, without
    // needing to listen for ticker-text travel distance.
    useLayoutEffect(() => {
        const element = containerRef.current;

        if (element === null) {
            return undefined;
        }

        const update = () => {
            const width = element.clientWidth;

            if (width === 0) {
                return;
            }

            setViewportScale(clamp(width / PREVIEW_CANVAS.width, 0.4, 1));
        };

        update();

        const observer = new ResizeObserver(update);
        observer.observe(element);

        return (): void => {
            observer.disconnect();
        };
    }, []);

    const currentItem = items[activeIndex] ??
        items[0] ?? { headline: '', text: '' };

    const labelBox = projectLabelBox(themeMeta);
    const slot = viewportSlotStyle(themeMeta);

    // Full-canvas shell height tracks the recompiled PNG's vertical
    // extent when the theme's meta.json is loaded, so the band
    // frames the painted strip exactly — no top/bottom crop.
    // Mirrors the shellHeight branch in resources/js/pages/ticker/
    // show.tsx. dyn2 (top_pct=15.87, bottom_pct=23.67) produces a
    // PNG of `bottom_pct − top_pct` percent of PREVIEW_CANVAS.height
    // (~84px on a 1080p design); the previous hardcoded `6%` (~65px)
    // made `backgroundSize: 100% auto` overflow and crop ~9px off
    // each end. Themes without meta.json (legacy / a no-bbox skin)
    // keep the original 6% so the bar still renders at a sensible
    // height. Source-natural vertical range is bounded to
    // [32, 250]px so abnormally thin or fat bboxes can't blow the
    // container up.
    const fullCanvasShellHeight = themeMeta !== null
        ? clamp(
            Math.round(
                PREVIEW_CANVAS.height *
                    (Math.max(
                        0,
                        themeMeta.bottom_pct - themeMeta.top_pct,
                    ) /
                        100),
            ),
            32,
            250,
        )
        : Math.round(PREVIEW_CANVAS.height * 0.06);

    const shellStyle: CSSProperties = {
        backgroundImage: `url("${imageUrl}")`,
        backgroundSize: '100% auto',
        backgroundRepeat: 'no-repeat',
        // Anchor the strip at the bottom of the shell so the PNG's
        // painted band sits flush with the container's bottom edge
        // instead of landing at the lossy `center 52%` offset that
        // paired with `100% auto` to crop the PNG's top and bottom.
        // With the dynamic height above matching the PNG's natural
        // height, this floor alignment is a no-op visually but
        // stays correct when the source happens to be shorter than
        // the canvas (the empty region then sits above the strip).
        backgroundPosition: 'center bottom',
        height: `${fullCanvasShellHeight}px`,
    };

    // Compact mode: the entire preview IS the strip. Scale the
    // compiled PNG to fit the container's width (100% auto) and
    // anchor it to the bottom of the container (center bottom) so
    // the bottom 6% of the PNG — the strip area — is what fills the
    // box. The container's aspect is set via inline `aspectRatio`
    // (computed from the real PNG dimensions in the useEffect
    // above) so the strip frames edge-to-edge with no empty canvas
    // above or below.
    const compactShellStyle: CSSProperties = {
        backgroundImage: `url("${imageUrl}")`,
        backgroundSize: '100% auto',
        backgroundPosition: 'center bottom',
        backgroundRepeat: 'no-repeat',
        height: '100%',
        top: 0,
        bottom: 0,
    };

    const activeShellStyle: CSSProperties = compact
        ? compactShellStyle
        : shellStyle;

    const labelStyle: CSSProperties =
        labelBox !== null
            ? {
                  left: `${labelBox.left}%`,
                  top: `${labelBox.top}%`,
                  width: `${labelBox.width}%`,
                  height: `${labelBox.height}%`,
              }
            : {
                  left: '0%',
                  top: 0,
                  bottom: 0,
                  width: '13%',
              };

    const labelMaxFontSize = clamp(Math.round(34 * viewportScale), 14, 34);
    const labelWidthInPx =
        labelBox !== null
            ? Math.max(
                  20,
                  Math.round(
                      (labelBox.width / 100) *
                          PREVIEW_CANVAS.width *
                          viewportScale,
                  ),
              )
            : Math.max(
                  20,
                  Math.round(0.13 * PREVIEW_CANVAS.width * viewportScale),
              );
    const labelFontSize = fitTextToWidth(currentItem.headline.toUpperCase(), {
        maxSize: labelMaxFontSize,
        minSize: 10,
        maxWidth: labelWidthInPx,
        fontWeight: '700',
    });

    const tickerFontSize = clamp(Math.round(28 * viewportScale), 16, 32);

    const handlePrev = () => {
        if (items.length < 2) {
            return;
        }

        setActiveIndex(
            (current) => (current - 1 + items.length) % items.length,
        );
    };

    const handleNext = () => {
        if (items.length < 2) {
            return;
        }

        setActiveIndex((current) => (current + 1) % items.length);
    };

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: SCROLL_STYLE_BLOCK }} />
            <div
                ref={containerRef}
                className={cn(
                    'relative isolate w-full overflow-hidden rounded-2xl border border-white/10 bg-neutral-950 shadow-[0_30px_120px_-30px_rgba(0,0,0,0.65)] ring-1 ring-white/5',
                    compact
                        ? compactAspect === null
                            ? 'aspect-[30/1]'
                            : null
                        : 'aspect-video',
                    className,
                )}
                style={
                    compact && compactAspect !== null
                        ? { aspectRatio: compactAspect.toFixed(3) }
                        : undefined
                }
                role="img"
                aria-label={`Live preview of ${currentItem.headline}`}
            >
                {/*
                  Lower-third ticker shell, the same shape the live
                  ticker uses (height = 6% of canvas, full-width strip
                  pinned to the bottom). The compiled PNG is painted as
                  the shell background, so the title stamp and end
                  stamp align with where they sit on air.
                */}
                <div
                    className={cn(
                        compact
                            ? 'absolute inset-0 z-10 overflow-hidden'
                            : 'absolute inset-x-0 bottom-0 z-10 overflow-hidden',
                    )}
                    style={activeShellStyle}
                >
                    {/* Subtle dimming bar so each side-stamp sees light
                        contrast over arbitrary backgrounds. The label uses
                        a heavier text shadow so headlines still pop on top
                        of light stamps. */}
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-transparent"
                    />

                    {/* Label overlay — same projection math as show.tsx */}
                    <div
                        className="absolute z-[2] flex items-center justify-center overflow-hidden text-center tracking-normal text-white uppercase"
                        style={labelStyle}
                    >
                        <span
                            className="block w-full px-2 font-bold"
                            style={{
                                fontSize: `${labelFontSize}px`,
                                lineHeight: 1.05,
                                textShadow:
                                    '0 1px 12px rgb(0 0 0 / 0.55), 0 0 4px rgb(0 0 0 / 0.45)',
                            }}
                        >
                            {currentItem.headline}
                        </span>
                    </div>

                    {/* Viewport slot — only the content slot scrolls */}
                    <div
                        className="absolute top-0 bottom-0 z-[1] flex items-center overflow-hidden"
                        style={slot}
                    >
                        <div
                            data-paused={isPaused ? 'true' : 'false'}
                            className={cn(
                                'ticker-skin-scroll-preview-track inline-flex w-max shrink-0 items-center font-semibold whitespace-nowrap',
                            )}
                            style={{
                                fontSize: `${tickerFontSize}px`,
                                color: '#172033',
                                textShadow:
                                    '0 1px 12px rgb(255 255 255 / 0.45)',
                                paddingInline: '1.5rem',
                            }}
                        >
                            <span>{currentItem.text}</span>
                            <span
                                aria-hidden="true"
                                className="mx-8 opacity-40"
                            >
                                •
                            </span>
                            <span>{currentItem.text}</span>
                            <span
                                aria-hidden="true"
                                className="mx-8 opacity-40"
                            >
                                •
                            </span>
                        </div>
                    </div>

                    {/* Slight inner border so the pill / bar shape reads
                        cleanly regardless of the theme's edge color. */}
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 border-y border-white/5"
                    />
                </div>

                {/*
                  HUD overlay — sample picker / playback controls so
                  visitors can drive the preview manually and verify the
                  theme in different lab conditions. Hidden in compact
                  mode because there's no canvas above the strip to
                  anchor the badge to and the playback controls are
                  noise when the user is just scanning the theme.
                */}
                {compact ? null : (
                <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-4">
                    <div className="pointer-events-auto flex items-center justify-between">
                        <div className="flex items-center gap-2 rounded-full border border-white/15 bg-black/55 px-3 py-1 text-[11px] tracking-widest text-white/85 uppercase backdrop-blur">
                            <span
                                aria-hidden="true"
                                className="inline-block size-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.85)]"
                            />
                            Live preview
                        </div>
                        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/15 bg-black/55 p-1 backdrop-blur">
                            <button
                                type="button"
                                onClick={handlePrev}
                                disabled={items.length < 2}
                                aria-label="Previous sample"
                                className="rounded-full p-1.5 text-white/85 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
                            >
                                <SkipBack className="size-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() =>
                                    setIsPaused((current) => !current)
                                }
                                disabled={items.length < 2}
                                aria-label={
                                    isPaused
                                        ? 'Resume samples'
                                        : 'Pause samples'
                                }
                                className="rounded-full p-1.5 text-white/85 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
                            >
                                {isPaused ? (
                                    <Play className="size-4" />
                                ) : (
                                    <Pause className="size-4" />
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={handleNext}
                                disabled={items.length < 2}
                                aria-label="Next sample"
                                className="rounded-full p-1.5 text-white/85 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
                            >
                                <SkipForward className="size-4" />
                            </button>
                        </div>
                    </div>

                    <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 self-end">
                        {items.map((item, index) => (
                            <button
                                key={`${item.headline}-${index}`}
                                type="button"
                                onClick={() => setActiveIndex(index)}
                                aria-label={`Show sample ${index + 1}`}
                                aria-current={
                                    index === activeIndex ? 'true' : undefined
                                }
                                className={cn(
                                    'h-1.5 rounded-full transition',
                                    index === activeIndex
                                        ? 'w-8 bg-white shadow-[0_0_10px_rgba(255,255,255,0.55)]'
                                        : 'w-1.5 bg-white/30 hover:bg-white/60',
                                )}
                            />
                        ))}
                    </div>
                </div>
                )}
            </div>
        </>
    );
}
