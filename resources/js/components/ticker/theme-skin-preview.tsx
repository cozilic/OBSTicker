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
}: ThemeSkinPreviewProps) {
    const [themeMeta, setThemeMeta] = useState<ThemeMeta | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [viewportScale, setViewportScale] = useState(1);
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

    const shellStyle: CSSProperties = {
        backgroundImage: `url("${imageUrl}")`,
        backgroundSize: '100% auto',
        backgroundRepeat: 'no-repeat',
        // Anchor to the engineer's slot line (52% from the top in
        // ticker/show.tsx). Themes whose stamp isn't vertically
        // centered in the canvas will end up shifted slightly, which
        // matches what audiences see live in OBS.
        backgroundPosition: 'center 52%',
        height: '6%',
    };

    const shellContainerStyle: CSSProperties = {
        bottom: 0,
    };

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
                    'relative isolate aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-neutral-950 shadow-[0_30px_120px_-30px_rgba(0,0,0,0.65)] ring-1 ring-white/5',
                    className,
                )}
                role="img"
                aria-label={`Live preview of ${currentItem.headline}`}
            >
                {/*
                  The compiled theme is rendered as a backdrop; we then
                  overlay the live ticker's label and viewport just like
                  ticker/show.tsx does — so the audience can see exactly
                  what the broadcaster will read.
                */}
                <div
                    className={cn(
                        'pointer-events-none absolute inset-0 z-0 bg-no-repeat',
                    )}
                    style={{
                        ...shellContainerStyle,
                        backgroundImage: `url("${imageUrl}")`,
                        backgroundSize: `${100 / 0.06}% auto`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'center 0%',
                    }}
                    aria-hidden="true"
                />

                {/*
                  Lower-third ticker shell, the same shape the live
                  ticker uses (height = 6% of canvas, full-width strip
                  pinned to the bottom). The compiled PNG is painted as
                  the shell background, so the title stamp and end
                  stamp align with where they sit on air.
                */}
                <div
                    className={cn(
                        'absolute inset-x-0 bottom-0 z-10 overflow-hidden',
                    )}
                    style={shellStyle}
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
                  theme in different lab conditions.
                */}
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
            </div>
        </>
    );
}
