import { Head } from '@inertiajs/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { fitTextToWidth } from '@/lib/text';

type TickerPayload = {
    settings: {
        headline: string;
        rss_headline: string;
        user_headline: string;
        background_color: string;
        text_color: string;
        accent_color: string;
        canvas_width: number;
        canvas_height: number;
        scale_percent: number;
        animation_style: 'slide-left' | 'fade' | 'bounce' | 'zoom';
        animation_duration_seconds: number;
        animation_out_duration_seconds: number;
        shape_style: 'bar' | 'pill' | 'angled';
        ticker_style: string | null;
        ticker_style_url: string | null;
        ticker_use_image_style: boolean;
        label_position: 'left' | 'right';
        chroma_key_color: 'green' | 'blue' | 'magenta';
        image_url: string | null;
        crawl_duration_seconds: number;
        message_display_seconds: number;
        poll_interval_seconds: number;
    };
    items: {
        type: string;
        label: string | null;
        text: string;
        url: string | null;
    }[];
};

type TickerItem = TickerPayload['items'][number];

const defaultTickerSkinUrl = '/images/default-ticker.png';

const fallbackPayload: TickerPayload = {
    settings: {
        headline: 'Latest news',
        rss_headline: 'Latest news',
        user_headline: 'Latest text',
        background_color: '#111827',
        text_color: '#ffffff',
        accent_color: '#38bdf8',
        canvas_width: 1920,
        canvas_height: 1080,
        scale_percent: 100,
        animation_style: 'slide-left',
        animation_duration_seconds: 1,
        animation_out_duration_seconds: 1,
        shape_style: 'bar',
        ticker_style: null,
        ticker_style_url: null,
        ticker_use_image_style: true,
        label_position: 'left',
        chroma_key_color: 'green',
        image_url: null,
        crawl_duration_seconds: 35,
        message_display_seconds: 18,
        poll_interval_seconds: 15,
    },
    items: [],
};

function shouldUseChromaKey(): boolean {
    if (typeof window === 'undefined') {
        return false;
    }

    const chroma = new URLSearchParams(window.location.search).get('chroma');

    return chroma === '1' || chroma === 'true' || chroma === 'green';
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

export default function TickerShow({ payloadUrl }: { payloadUrl: string }) {
    const [payload, setPayload] = useState<TickerPayload>(fallbackPayload);
    const [useChromaKey] = useState(shouldUseChromaKey);
    const [displayedItem, setDisplayedItem] = useState<TickerItem | null>(null);
    const tickerViewportRef = useRef<HTMLDivElement | null>(null);
    const tickerTrackRef = useRef<HTMLDivElement | null>(null);
    const [tickerDurationSeconds, setTickerDurationSeconds] = useState(
        payload.settings.crawl_duration_seconds,
    );
    const [tickerTextFontSize, setTickerTextFontSize] = useState(22);
    const [viewportScale, setViewportScale] = useState(1);
    const [tickerStartOffset, setTickerStartOffset] = useState(100);
    const [themeMeta, setThemeMeta] = useState<{
        split_1: number;
        split_2: number;
        left_pct: number;
        right_pct: number;
        // Source-natural bbox percentages persisted by the theme
        // builder. Required for the manual label-box coordinate
        // remap below — the user's source-percent label rect is
        // projected into compiled-percent using these as the
        // horizontal/vertical bounds of the source's title cut.
        top_pct: number;
        bottom_pct: number;
        // Visible-stamp coordinates in canvas-percent space, written
        // by ThemeImageSlicer::slice() and persisted in meta.json.
        // Sourced after CONTAIN-fit + asymmetric anchoring so they
        // describe the actual rendered stamp, not the source's slot
        // boundaries. Optional so themes that haven't been recompiled
        // since this metric was added (or hand-edited meta.json files)
        // still render with the slot-based fallback below.
        title_stamp_left_pct?: number;
        title_stamp_width_pct?: number;
        end_stamp_left_pct?: number;
        end_stamp_width_pct?: number;
        // Manual label-box percentages in SOURCE-NATURAL space (NOT
        // canvas-percent). The artist drags the box on the unmodified
        // source image in the theme builder, so the values are
        // expressed in the same coordinate system as split_1, left_pct,
        // etc. The consumer remaps these into compiled/canvas-percent
        // via `manualLabelBox` below so the live overlay lands over
        // the actual visible stamp rather than over the pre-fit
        // source bbox. Themes that pre-date the new theme-builder
        // flow lack these keys and fall through to the alpha-aware
        // visibleBounds path.
        label_left_pct?: number;
        label_width_pct?: number;
        label_top_pct?: number;
        label_height_pct?: number;
        // Round-trip flag toggled in the theme builder —
        // when true, content stretches to the bounding-box
        // right edge and the end region collapses. Optional
        // so legacy meta.json that predates this field still
        // loads with the non-dynamic runtime defaults.
        dynamic_content_stretch?: boolean | undefined;
    } | null>(null);
    const isVisible = payload.items.length > 0;
    const hasThemeSkin = Boolean(payload.settings.ticker_style);
    const useTickerSkin = !useChromaKey && hasThemeSkin;
    const tickerSkinUrl = useTickerSkin
        ? (payload.settings.ticker_style_url ?? defaultTickerSkinUrl)
        : null;
    const currentItem = useMemo(() => {
        if (payload.items.length === 0) {
            return null;
        }

        if (!displayedItem) {
            return payload.items[0] ?? null;
        }

        return (
            payload.items.find(
                (item) =>
                    item.type === displayedItem.type &&
                    item.label === displayedItem.label &&
                    item.text === displayedItem.text &&
                    item.url === displayedItem.url,
            ) ??
            payload.items[0] ??
            null
        );
    }, [displayedItem, payload.items]);
    const headline =
        currentItem?.type === 'rss'
            ? payload.settings.rss_headline
            : payload.settings.user_headline;
    const headlineText = headline || payload.settings.headline;
    const hasImage = !hasThemeSkin && Boolean(payload.settings.image_url);
    const labelIsRight = payload.settings.label_position === 'right';
    // The shell height matches the recompiled PNG's vertical extent
    // when a theme skin with bbox metadata is loaded, so
    // `backgroundSize: '100% auto'` paints the full PNG without clipping
    // the top/bottom. dyn2 (top_pct=15.87, bottom_pct=23.67) used to
    // paint an 84px PNG inside a 65px shell — with `center 52%` the
    // image overflowed top and bottom by ~9px each. Themes without a
    // meta.json (legacy / a no-bbox skin) keep the original 6% of
    // canvas assumption so the bar still renders at a sensible height.
    const shellHeight = useTickerSkin && themeMeta !== null
        ? clamp(
            Math.round(
                payload.settings.canvas_height *
                    (Math.max(
                        0,
                        themeMeta.bottom_pct - themeMeta.top_pct,
                    ) /
                        100),
            ),
            32,
            250,
        )
        : clamp(
            Math.round(payload.settings.canvas_height * 0.06),
            36,
            96,
        );
    const labelWidth = useTickerSkin
        ? 0
        : clamp(Math.round(payload.settings.canvas_width * 0.12), 120, 320);
    const imageWidth = hasImage
        ? clamp(Math.round(payload.settings.canvas_width * 0.05), 64, 128)
        : 0;
    const shellColumns = useTickerSkin
        ? '1fr'
        : labelIsRight
          ? hasImage
              ? `1fr ${labelWidth}px ${imageWidth}px`
              : `1fr ${labelWidth}px`
          : hasImage
            ? `${imageWidth}px ${labelWidth}px 1fr`
            : `${labelWidth}px 1fr`;
    const imageColumn = labelIsRight ? 'col-start-3' : 'col-start-1';
    const labelColumn = labelIsRight
        ? 'col-start-2'
        : hasImage
          ? 'col-start-2'
          : 'col-start-1';
    const tickerColumn = labelIsRight
        ? 'col-start-1'
        : hasImage
          ? 'col-start-3'
          : 'col-start-2';
    const shellPaddingX = clamp(Math.round(shellHeight * 0.22), 8, 20);
    const labelMaxFontSize = clamp(Math.round(shellHeight * 0.34), 14, 22);
    // WYCIWYG: when the ticker has a theme skin the label sits over
    // the visible title stamp, so fitTextToWidth's budget must come
    // from THAT stamp's width (in viewport-scaled px) — not a
    // hardcoded slice of canvas_width. Sizing to 13% of canvas_width
    // (≈250px on a 1920px design) caused text to spill past any stamp
    // narrower than that budget. We derive the budget from the same
    // `title_stamp_width_pct` meta.json coordinate the label <div> is
    // positioned against, fall back to the source slot width
    // (themeMeta.split_1 - left_pct) for themes whose meta.json predates
    // the visible-stamp metrics, and fall back to the legacy 13% only
    // for old themes with no meta.json at all. The 20px floor keeps a
    // vanishingly small stamp from collapsing the headline to a
    // single-character minSize fallback.
    //
    // Manual label override beats the alpha-aware chain: every theme
    // committed through the new theme-builder sends explicit
    // label_width_pct into meta.json, so this branch is now the
    // dominant path for any current build.
    //
    // `manualLabelBox` is the SOURCE-PERCENT → COMPILED-PERCENT
    // remap of the user's label rect. Without it, the headline's
    // `fitTextToWidth` budget would scale to the source-percent
    // width (e.g. 25% of canvas = 480px on a 1920 design) instead
    // of the much smaller compiled stamp width (e.g. 4% of canvas
    // = 80px), and the headline would render larger than the visible
    // title stamp can carry — which is exactly the "text outside
    // the box" symptom the user pushed back on.
    const manualLabelBox = useMemo(() => {
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

        // Horizontal remap: source's title cut is [left_pct, split_1]
        // in source-percent; compiled title stamp is
        // [title_stamp_left_pct, title_stamp_left_pct + title_stamp_width_pct]
        // in canvas-percent. Project the user's source-percent label
        // rect into the compiled stamp's rect with a linear map.
        // Falls back to the source's slot width when the alpha-aware
        // metrics are missing (legacy meta.json), which means the
        // remap becomes a no-op and the label stays in source space
        // — visually wrong but never crashes.
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

        // Vertical remap: source's title cut runs from bboxTop to
        // bboxBottom in source-percent. The compiled slot is
        // top-aligned and occupies the full canvas height, so the
        // vertical map is a linear projection from
        // [bboxTop, bboxBottom] onto [0, 100]%. With the user's
        // default bbox (0..100) this is an identity, so a fresh
        // theme behaves the same as before. Crops that tighten the
        // bbox make the remap non-trivial.
        const verticalRange = Math.max(
            0.01,
            themeMeta.bottom_pct - themeMeta.top_pct,
        );
        const top = clamp(
            ((themeMeta.label_top_pct - themeMeta.top_pct) / verticalRange) *
                100,
            0,
            100,
        );
        const height = clamp(
            (themeMeta.label_height_pct / verticalRange) * 100,
            0,
            100,
        );

        return { left, top, width, height };
    }, [themeMeta]);

    const labelStampPct = useTickerSkin
        ? manualLabelBox !== null
            ? manualLabelBox.width
            : themeMeta !== null &&
                typeof themeMeta.title_stamp_width_pct === 'number'
              ? themeMeta.title_stamp_width_pct
              : themeMeta !== null
                ? Math.max(0, themeMeta.split_1 - themeMeta.left_pct)
                : 13
        : null;
    const labelFontSize = fitTextToWidth(headlineText.toUpperCase(), {
        maxSize: Math.max(10, Math.round(labelMaxFontSize * viewportScale)),
        minSize: 10,
        maxWidth: useTickerSkin
            ? Math.max(
                  20,
                  Math.round(
                      ((labelStampPct ?? 13) / 100) *
                          payload.settings.canvas_width *
                          viewportScale,
                  ),
              )
            : Math.max(0, labelWidth - shellPaddingX * 2),
        fontWeight: '700',
    });
    const tickerFontSize = clamp(Math.round(shellHeight * 0.52), 18, 34);
    const imageMaxHeight = clamp(Math.round(shellHeight * 0.72), 24, 52);
    const shellAnimationInDuration = `${clamp(payload.settings.animation_duration_seconds, 1, 10)}s`;
    const shellAnimationOutDuration = `${clamp(payload.settings.animation_out_duration_seconds, 1, 10)}s`;
    const tickerTextColor = useTickerSkin
        ? '#172033'
        : payload.settings.text_color;
    const chromaBackground = {
        green: '#00ff00',
        blue: '#0000ff',
        magenta: '#ff00ff',
    }[payload.settings.chroma_key_color];
    const chromaContentBackground = useChromaKey
        ? '#0f172a'
        : payload.settings.background_color;
    const chromaLabelBackground = useChromaKey
        ? '#f8fafc'
        : payload.settings.accent_color;
    const chromaLabelText = useChromaKey
        ? '#0f172a'
        : payload.settings.background_color;
    const tickerText = useMemo(() => {
        if (!currentItem) {
            return '';
        }

        // The rolling content-region text holds ONLY the body of the
        // current item — not the source label that was historically
        // prepended here as `${label}: ${text}`. Title region already
        // shows the static headline (rss_headline / user_headline /
        // headline fallback); the context region should therefore
        // contain just the item body. Mixing the source label into
        // the rolling stream produced the appearance of "label text
        // in the context scroll" — the exact layout the user has
        // pushed back on for several iterations.
        return currentItem.text;
    }, [currentItem]);
    const tickerMinDurationSeconds = clamp(
        payload.settings.crawl_duration_seconds,
        5,
        240,
    );
    // User-driven display scale (20-200%) from the ticker-admin
    // "Display scale" slider. Applied to the live ticker as a CSS
    // transform: scale on a separate WRAPPER element so the inline
    // transform does NOT collide with the existing
    // `.lower-third-in` / `.lower-third-out` and per-animation
    // `.lower-third-slide-left | .lower-third-fade | .lower-third-bounce
    // | .lower-third-zoom` keyframes — those use
    // `animation-fill-mode: both` and write to `transform`, which
    // would permanently override an inline transform on the shell
    // itself. Wrapping the shell in a dedicated scale element keeps
    // the two transform stacks on different elements so both win
    // cleanly. `transform-origin: center bottom` keeps the ticker
    // anchored to the canvas's bottom edge so it grows upward (not
    // floats upward) when the user sets scale > 100%.
    const tickerScalePercent = clamp(payload.settings.scale_percent ?? 100, 20, 200);
    const scaledShellWrapperStyle: CSSProperties = {
        transform: `scale(${tickerScalePercent / 100})`,
        transformOrigin: 'center bottom',
    };
    const shellStyle: CSSProperties & {
        '--lower-third-in-duration': string;
        '--lower-third-out-duration': string;
        '--ticker-start-offset': string;
    } = {
        bottom: '0',
        height: `${shellHeight}px`,
        // Skin path: the compiled PNG carries the entire visible
        // design — the shell stamp behind it is the OBS compositing
        // layer, not another design surface. The body/html/#app
        // chain is inline-forced to transparent by the effect below,
        // so making the shell transparent lets OBS's browser-source
        // alpha carry straight through to the scene without leaking
        // a solid `background_color` block behind the PNG's
        // transparent columns. The previous default `#111827` was
        // exactly the "black box around the theme" symptom the user
        // hit; chroma+skin was already transparent for the same
        // reason, and subsumed into this single rule (chroma mode
        // also paints the body with `chromaBackground`, so chroma
        // color still bleeds through transparently here).
        backgroundColor: useTickerSkin
            ? 'transparent'
            // Non-skin path: the user-set `background_color` IS the
            // visible design, not a compositing layer — keep it
            // opaque. (`chromaContentBackground` resolves to a dark
            // slate in non-skin + chroma and to `background_color`
            // otherwise.)
            : chromaContentBackground,
        backgroundImage: tickerSkinUrl ? `url("${tickerSkinUrl}")` : undefined,
        // Anchor at the bottom so the strip art sits flush with the
        // screen edge instead of landing at the lossy 'center 52%'
        // offset that paired with `100% auto` to crop the PNG's top
        // and bottom. With the dynamic shellHeight above matching the
        // PNG's natural height, this floor alignment is a no-op
        // visually but stays correct if the source happens to be
        // shorter than the canvas (then top of the shell is empty).
        backgroundPosition: 'center bottom',
        backgroundRepeat: 'no-repeat',
        backgroundSize: '100% auto',
        color: tickerTextColor,
        zIndex: 1,
        gridTemplateColumns: shellColumns,
        '--ticker-start-offset': `${tickerStartOffset}px`,
        '--lower-third-in-duration': shellAnimationInDuration,
        '--lower-third-out-duration': shellAnimationOutDuration,
    };
    const defaultSkinLabelStyle: CSSProperties = useTickerSkin
        ? themeMeta !== null
            ? // MANUAL FIRST: when the theme builder saved an explicit
              // label rect (the new theme-builder path), use the
              // `manualLabelBox` remap (source-percent → compiled-
              // percent) as the lone anchor for both axes. The
              // artist's box is drawn on the source image so its
              // coordinates are in source-percent; the live ticker
              // renders over the compiled PNG, so the rect must be
              // projected into the compiled stamp's coordinate
              // space or the headline lands outside the title
              // stamp. Vertical positioning switches from
              // top:0/bottom:0 to top + height so the headline truly
              // sits inside the artist-placed rectangle instead of
              // auto-stretching to the title-slot height.
              manualLabelBox !== null
                ? {
                      top: `${manualLabelBox.top}%`,
                      height: `${manualLabelBox.height}%`,
                      bottom: 'auto',
                      left: `${manualLabelBox.left}%`,
                      width: `${manualLabelBox.width}%`,
                  }
                : // WYCIWYG: position the label over the VISIBLE title
                  // stamp, not the source's slot. meta.json's
                  // title_stamp_left_pct / title_stamp_width_pct describe
                  // where the stamp ends up after CONTAIN-fit +
                  // right-anchoring, so the label sits exactly over the
                  // visible artwork. We fall back to slot boundaries
                  // ([left_pct, split_1]) when a theme's meta.json predates
                  // the metric so previously-compiled themes keep rendering
                  // rather than regressing to the hardcoded 13% / 5%
                  // defaults that the live ticker used before the
                  // visible-stamp metrics existed.
                  {
                      top: 0,
                      bottom: 0,
                      left:
                          typeof themeMeta.title_stamp_left_pct === 'number'
                              ? `${themeMeta.title_stamp_left_pct}%`
                              : `${themeMeta.left_pct}%`,
                      width:
                          typeof themeMeta.title_stamp_width_pct === 'number'
                              ? `${themeMeta.title_stamp_width_pct}%`
                              : `${Math.max(0, themeMeta.split_1 - themeMeta.left_pct)}%`,
                  }
            : // Legacy themes without meta.json (no cuts+bbox persisted)
              // fall through to a reasonable default — these numbers
              // align with the typical ticker-banner layout where the
              // title stamp occupies the first ~13% of the canvas.
              {
                  top: 0,
                  bottom: 0,
                  left: '0%',
                  width: '13%',
              }
        : {};

    const defaultSkinTickerViewportStyle: CSSProperties = useTickerSkin
        ? themeMeta !== null
            ? // When dynamic_content_stretch is on (theme-builder
              // flag persisted in meta.json) the slicer snaps
              // BOTH edges of the bounding box AND both cuts to
              // the canvas edges, so the content slot fills 0–100%
              // of the canvas and the title/end stamps collapse to
              // a 1px footprint. The viewport therefore spans the
              // full canvas width ("screen entirely, end-to-end")
              // so the scrolling text rides the entire strip
              // instead of being parked at the legacy [split_1,
              // split_2] mid-panel. Without the flag the viewport
              // stays [split_1, split_2] — the legacy "ticker in a
              // finite center panel" look.
              {
                  top: 0,
                  bottom: 0,
                  left: themeMeta.dynamic_content_stretch === true
                      ? '0%'
                      : `${themeMeta.split_1}%`,
                  right: themeMeta.dynamic_content_stretch === true
                      ? '0%'
                      : `${Math.max(0, 100 - themeMeta.split_2)}%`,
              }
            : {
                  top: 0,
                  bottom: 0,
                  left: '13%',
                  right: '5%',
              }
        : {};

    useEffect(() => {
        // Theme cuts (split_1, split_2 and the bbox bounds) live in the
        // theme's meta.json next to the compiled PNG. Fetch it whenever
        // the active skin changes so the label and viewport overlays
        // align with the title and content stamps the user laid out in
        // the theme builder. The consumer's `defaultSkinLabelStyle` /
        // `defaultSkinTickerViewportStyle` early-return `{}` whenever
        // `useTickerSkin` is false, so we don't have to clear
        // `themeMeta` synchronously when the skin becomes inactive —
        // stale meta is harmless because it never reaches the DOM.
        //
        // Cancellation goes through AbortController so a rapid theme
        // switch can't overwrite the new theme's metadata with the
        // previous one's response.
        if (!useTickerSkin || !tickerSkinUrl) {
            return undefined;
        }

        const metaUrl = tickerSkinUrl.replace(/\.png(?=$|\?)/, '.json');
        const controller = new AbortController();

        void fetch(metaUrl, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        })
            .then((response) => (response.ok ? response.json() : null))
            .then((data: unknown) => {
                if (controller.signal.aborted) {
                    return;
                }

                if (data === null || typeof data !== 'object') {
                    // 404 or non-JSON response; the theme has no live
                    // meta.json, so fall back to the hardcoded
                    // percentages in the consumer instead of leaking
                    // the previous theme's positions into the new one.
                    setThemeMeta(null);

                    return;
                }

                const record = data as {
                    split_1?: unknown;
                    split_2?: unknown;
                    left_pct?: unknown;
                    right_pct?: unknown;
                    top_pct?: unknown;
                    bottom_pct?: unknown;
                    title_stamp_left_pct?: unknown;
                    title_stamp_width_pct?: unknown;
                    end_stamp_left_pct?: unknown;
                    end_stamp_width_pct?: unknown;
                    label_left_pct?: unknown;
                    label_width_pct?: unknown;
                    label_top_pct?: unknown;
                    label_height_pct?: unknown;
                    // Round-trip flag toggled in the theme builder —
                    // when true, the content stream stretches all
                    // the way to the canvas right edge so the live
                    // ticker viewport equals (screen − title − end)
                    // instead of stopping at the end slot. Optional
                    // so meta.json from themes predating this field
                    // still parses with the bounded slot defaults.
                    dynamic_content_stretch?: unknown;
                };

                if (
                    typeof record.split_1 !== 'number' ||
                    typeof record.split_2 !== 'number'
                ) {
                    // Legacy theme compiled before cuts+bbox were
                    // persisted. Hardcoded percentages in the consumer
                    // are the right fallback here too.
                    setThemeMeta(null);

                    return;
                }

                setThemeMeta({
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
                });
            })
            .catch(() => {
                // Aborted requests surface here as AbortError and
                // are expected on cleanup; the next skin's effect will
                // set its own themeMeta. Real failures (network drop
                // or a server 500 on a non-aborted fetch) must clear
                // stale meta so the next render doesn't apply the
                // previous theme's positions to the current skin.
                if (controller.signal.aborted) {
                    return;
                }

                setThemeMeta(null);
            });

        return (): void => {
            controller.abort();
        };
    }, [useTickerSkin, tickerSkinUrl]);

    useLayoutEffect(() => {
        if (!currentItem) {
            window.requestAnimationFrame(() => {
                setTickerDurationSeconds(tickerMinDurationSeconds);
                setTickerTextFontSize(tickerFontSize);
                setViewportScale(
                    clamp(
                        (window.innerWidth || payload.settings.canvas_width) /
                            payload.settings.canvas_width,
                        0.55,
                        1,
                    ),
                );
                setTickerStartOffset(
                    window.innerWidth || payload.settings.canvas_width,
                );
            });

            return;
        }

        const measureDuration = () => {
            const nextViewportScale = clamp(
                (window.innerWidth || payload.settings.canvas_width) /
                    payload.settings.canvas_width,
                0.55,
                1,
            );
            const viewportWidth =
                tickerViewportRef.current?.clientWidth ?? window.innerWidth;
            const trackWidth = tickerTrackRef.current?.scrollWidth ?? 0;
            const travelDistance = viewportWidth + trackWidth;
            const estimatedDurationSeconds = Math.ceil(travelDistance / 90);
            const nextTickerStartOffset =
                tickerViewportRef.current?.clientWidth ?? window.innerWidth;
            const nextFontSize = fitTextToWidth(tickerText, {
                maxSize: Math.max(
                    16,
                    Math.round(tickerFontSize * nextViewportScale),
                ),
                minSize: 16,
                maxWidth: viewportWidth,
                fontWeight: '600',
            });

            setTickerDurationSeconds(
                Math.max(tickerMinDurationSeconds, estimatedDurationSeconds),
            );
            setTickerTextFontSize(nextFontSize);
            setViewportScale(nextViewportScale);
            setTickerStartOffset(nextTickerStartOffset);
        };

        measureDuration();

        const observer = new ResizeObserver(measureDuration);

        if (tickerViewportRef.current) {
            observer.observe(tickerViewportRef.current);
        }

        if (tickerTrackRef.current) {
            observer.observe(tickerTrackRef.current);
        }

        window.addEventListener('resize', measureDuration);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', measureDuration);
        };
    }, [
        currentItem,
        tickerMinDurationSeconds,
        tickerText,
        payload.settings.canvas_width,
        payload.settings.canvas_height,
        shellPaddingX,
        tickerFontSize,
    ]);

    useEffect(() => {
        const backgroundColor = useChromaKey ? chromaBackground : 'transparent';
        const app = document.getElementById('app');

        document.documentElement.style.background = backgroundColor;
        document.documentElement.style.height = '100%';
        document.documentElement.style.overflow = 'hidden';
        document.body.style.background = backgroundColor;
        document.body.style.height = '100%';
        document.body.style.margin = '0';
        document.body.style.overflow = 'hidden';

        if (app) {
            app.style.background = backgroundColor;
            app.style.position = 'fixed';
            app.style.inset = '0';
            app.style.width = '100vw';
            app.style.height = '100dvh';
            app.style.overflow = 'hidden';
        }

        return () => {
            document.documentElement.style.background = '';
            document.documentElement.style.height = '';
            document.documentElement.style.overflow = '';
            document.body.style.background = '';
            document.body.style.height = '';
            document.body.style.margin = '';
            document.body.style.overflow = '';

            if (app) {
                app.style.background = '';
                app.style.position = '';
                app.style.inset = '';
                app.style.width = '';
                app.style.height = '';
                app.style.overflow = '';
            }
        };
    }, [chromaBackground, useChromaKey]);

    useEffect(() => {
        let isMounted = true;

        const loadPayload = async () => {
            const response = await fetch(payloadUrl, {
                headers: { Accept: 'application/json' },
            }).catch(() => null);

            if (isMounted && response?.ok) {
                const nextPayload: TickerPayload = await response.json();

                setPayload(nextPayload);
                setDisplayedItem((current) => {
                    if (nextPayload.items.length === 0) {
                        return null;
                    }

                    if (!current) {
                        return nextPayload.items[0] ?? null;
                    }

                    const stillExists = nextPayload.items.some(
                        (item) =>
                            item.type === current.type &&
                            item.label === current.label &&
                            item.text === current.text &&
                            item.url === current.url,
                    );

                    return stillExists
                        ? current
                        : (nextPayload.items[0] ?? null);
                });
            }
        };

        void loadPayload();
        const timer = window.setInterval(
            () => void loadPayload(),
            payload.settings.poll_interval_seconds * 1000,
        );

        return () => {
            isMounted = false;
            window.clearInterval(timer);
        };
    }, [payload.settings.poll_interval_seconds, payloadUrl]);

    const advanceItem = () => {
        if (payload.items.length === 0) {
            setDisplayedItem(null);

            return;
        }

        setDisplayedItem((current) => {
            if (!current) {
                return payload.items[0] ?? null;
            }

            const currentIndex = payload.items.findIndex(
                (item) =>
                    item.type === current.type &&
                    item.label === current.label &&
                    item.text === current.text &&
                    item.url === current.url,
            );

            if (currentIndex === -1) {
                return payload.items[0] ?? null;
            }

            return (
                payload.items[(currentIndex + 1) % payload.items.length] ??
                payload.items[0] ??
                null
            );
        });
    };

    return (
        <>
            <Head title="Ticker" />
            <div className="fixed inset-0 h-[100dvh] w-screen overflow-hidden font-sans">
                {useChromaKey && (
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0"
                        style={{ backgroundColor: chromaBackground }}
                    />
                )}
                <div className="absolute inset-0" style={scaledShellWrapperStyle}>
                <div
                    key={`${currentItem?.type ?? 'empty'}-${currentItem?.label ?? ''}-${currentItem?.text ?? ''}-${payload.settings.animation_style}-${payload.settings.shape_style}`}
                    className={[
                        'lower-third-shell absolute right-0 left-0 grid overflow-hidden shadow-2xl',
                        payload.settings.shape_style === 'pill'
                            ? 'mx-10 rounded-full'
                            : '',
                        payload.settings.shape_style === 'bar' ? '' : '',
                        payload.settings.shape_style === 'angled'
                            ? '[clip-path:polygon(0_0,98%_0,100%_100%,0_100%)]'
                            : '',
                        isVisible
                            ? `lower-third-in lower-third-${payload.settings.animation_style}`
                            : `lower-third-out lower-third-${payload.settings.animation_style}`,
                    ].join(' ')}
                    style={shellStyle}
                >
                    {payload.settings.image_url && (
                        <div
                            className={`relative z-10 row-start-1 flex items-center justify-center bg-white/10 ${imageColumn}`}
                            style={{ paddingInline: `${shellPaddingX}px` }}
                        >
                            <img
                                src={payload.settings.image_url}
                                alt=""
                                className="object-contain"
                                style={{
                                    maxHeight: `${imageMaxHeight}px`,
                                    maxWidth: `${Math.max(40, imageWidth - shellPaddingX * 2)}px`,
                                }}
                            />
                        </div>
                    )}
                    <div
                        className={[
                            'z-10 flex items-center justify-center overflow-hidden text-center uppercase',
                            useTickerSkin
                                ? 'absolute'
                                : `relative row-start-1 ${labelColumn}`,
                        ].join(' ')}
                        style={{
                            backgroundColor: useTickerSkin
                                ? 'transparent'
                                : chromaLabelBackground,
                            color: useTickerSkin ? '#ffffff' : chromaLabelText,
                            fontSize: `${labelFontSize}px`,
                            // Padding only applies inside the styled
                            // grid cell (non-ticker-skin) so the
                            // headline chip has breathing room from
                            // its own background. On the ticker-skin
                            // path the label <div> IS positioned over
                            // the visible stamp, so internal padding
                            // would eat into the stamp's textable
                            // area and force fitTextToWidth to
                            // under-budget the headline.
                            paddingInline: useTickerSkin
                                ? '0px'
                                : `${shellPaddingX}px`,
                            textShadow: useTickerSkin
                                ? '0 1px 8px rgb(0 0 0 / 0.45)'
                                : undefined,
                            ...defaultSkinLabelStyle,
                        }}
                    >
                        {headlineText}
                    </div>
                    <div
                        ref={tickerViewportRef}
                        className={[
                            'z-0 flex min-w-0 items-center overflow-hidden [direction:ltr]',
                            useTickerSkin
                                ? 'absolute'
                                : `relative row-start-1 ${tickerColumn}`,
                        ].join(' ')}
                        style={{
                            ...defaultSkinTickerViewportStyle,
                            paddingInlineStart: useTickerSkin
                                ? undefined
                                : `${shellPaddingX}px`,
                            paddingInlineEnd: useTickerSkin
                                ? undefined
                                : `${shellPaddingX}px`,
                        }}
                    >
                        <div
                            ref={tickerTrackRef}
                            className="ticker-scroll inline-flex w-max shrink-0 font-semibold tracking-normal whitespace-nowrap"
                            onAnimationEnd={advanceItem}
                            style={{
                                animationDuration: `${tickerDurationSeconds}s`,
                                animationPlayState: isVisible
                                    ? 'running'
                                    : 'paused',
                                fontSize: `${tickerTextFontSize}px`,
                                paddingInline: `${shellPaddingX}px`,
                                textShadow: useTickerSkin
                                    ? '0 1px 10px rgb(255 255 255 / 0.5)'
                                    : undefined,
                            }}
                        >
                            <span>{tickerText}</span>
                        </div>
                    </div>
                    <div className="pointer-events-none z-[1] col-span-full row-start-1 bg-gradient-to-r from-black/30 via-transparent to-transparent" />
                </div>
                </div>
            </div>
        </>
    );
}
