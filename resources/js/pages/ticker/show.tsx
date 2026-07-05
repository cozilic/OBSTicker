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
        animation_style: 'slide-left' | 'fade' | 'bounce' | 'zoom';
        animation_duration_seconds: number;
        animation_out_duration_seconds: number;
        shape_style: 'bar' | 'pill' | 'angled';
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
        animation_style: 'slide-left',
        animation_duration_seconds: 1,
        animation_out_duration_seconds: 1,
        shape_style: 'bar',
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
    const [tickerDurationSeconds, setTickerDurationSeconds] = useState(payload.settings.crawl_duration_seconds);
    const [tickerTextFontSize, setTickerTextFontSize] = useState(22);
    const [viewportScale, setViewportScale] = useState(1);
    const isVisible = payload.items.length > 0;
    const useDefaultTickerSkin = !useChromaKey;
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
            ) ?? payload.items[0] ?? null
        );
    }, [displayedItem, payload.items]);
    const headline = currentItem?.type === 'rss' ? payload.settings.rss_headline : payload.settings.user_headline;
    const headlineText = headline || payload.settings.headline;
    const hasImage = Boolean(payload.settings.image_url);
    const labelIsRight = payload.settings.label_position === 'right';
    const shellHeight = clamp(Math.round(payload.settings.canvas_height * 0.06), 36, 96);
    const labelWidth = useDefaultTickerSkin ? 0 : clamp(Math.round(payload.settings.canvas_width * 0.12), 120, 320);
    const imageWidth = hasImage ? clamp(Math.round(payload.settings.canvas_width * 0.05), 64, 128) : 0;
    const shellColumns = useDefaultTickerSkin
        ? '1fr'
        : labelIsRight
        ? hasImage
            ? `1fr ${labelWidth}px ${imageWidth}px`
            : `1fr ${labelWidth}px`
        : hasImage
            ? `${imageWidth}px ${labelWidth}px 1fr`
            : `${labelWidth}px 1fr`;
    const imageColumn = labelIsRight ? 'col-start-3' : 'col-start-1';
    const labelColumn = labelIsRight ? 'col-start-2' : hasImage ? 'col-start-2' : 'col-start-1';
    const tickerColumn = labelIsRight ? 'col-start-1' : hasImage ? 'col-start-3' : 'col-start-2';
    const shellPaddingX = clamp(Math.round(shellHeight * 0.22), 8, 20);
    const labelMaxFontSize = clamp(Math.round(shellHeight * 0.34), 14, 22);
    const labelFontSize = fitTextToWidth(headlineText.toUpperCase(), {
        maxSize: Math.max(10, Math.round(labelMaxFontSize * viewportScale)),
        minSize: 10,
        maxWidth: useDefaultTickerSkin ? Math.round(payload.settings.canvas_width * 0.13) : Math.max(0, labelWidth - shellPaddingX * 2),
        fontWeight: '700',
    });
    const tickerFontSize = clamp(Math.round(shellHeight * 0.52), 18, 34);
    const imageMaxHeight = clamp(Math.round(shellHeight * 0.72), 24, 52);
    const shellAnimationInDuration = `${clamp(payload.settings.animation_duration_seconds, 1, 10)}s`;
    const shellAnimationOutDuration = `${clamp(payload.settings.animation_out_duration_seconds, 1, 10)}s`;
    const tickerTextColor = useDefaultTickerSkin ? '#172033' : payload.settings.text_color;
    const chromaBackground = {
        green: '#00ff00',
        blue: '#0000ff',
        magenta: '#ff00ff',
    }[payload.settings.chroma_key_color];
    const chromaContentBackground = useChromaKey ? '#0f172a' : payload.settings.background_color;
    const chromaLabelBackground = useChromaKey ? '#f8fafc' : payload.settings.accent_color;
    const chromaLabelText = useChromaKey ? '#0f172a' : payload.settings.background_color;
    const tickerText = useMemo(() => {
        if (!currentItem) {
            return '';
        }

        return currentItem.label ? `${currentItem.label}: ${currentItem.text}` : currentItem.text;
    }, [currentItem]);
    const tickerMinDurationSeconds = clamp(payload.settings.crawl_duration_seconds, 5, 240);
    const shellStyle: CSSProperties & {
        '--lower-third-in-duration': string;
        '--lower-third-out-duration': string;
    } = {
        bottom: '0',
        height: `${shellHeight}px`,
        backgroundColor: useDefaultTickerSkin ? 'transparent' : chromaContentBackground,
        backgroundImage: useDefaultTickerSkin ? `url("${defaultTickerSkinUrl}")` : undefined,
        backgroundPosition: 'center 52%',
        backgroundRepeat: 'no-repeat',
        backgroundSize: '100% auto',
        color: tickerTextColor,
        zIndex: 1,
        gridTemplateColumns: shellColumns,
        '--lower-third-in-duration': shellAnimationInDuration,
        '--lower-third-out-duration': shellAnimationOutDuration,
    };
    const defaultSkinLabelStyle: CSSProperties = useDefaultTickerSkin
        ? {
            top: 0,
            bottom: 0,
            left: '8.5%',
            width: '13.25%',
        }
        : {};
    const defaultSkinTickerViewportStyle: CSSProperties = useDefaultTickerSkin
        ? {
            top: 0,
            bottom: 0,
            left: '23%',
            right: '9.5%',
        }
        : {};

    useLayoutEffect(() => {
        if (!currentItem) {
            window.requestAnimationFrame(() => {
                setTickerDurationSeconds(tickerMinDurationSeconds);
                setTickerTextFontSize(tickerFontSize);
                setViewportScale(clamp((window.innerWidth || payload.settings.canvas_width) / payload.settings.canvas_width, 0.55, 1));
            });

            return;
        }

        const measureDuration = () => {
            const nextViewportScale = clamp((window.innerWidth || payload.settings.canvas_width) / payload.settings.canvas_width, 0.55, 1);
            const viewportWidth = tickerViewportRef.current?.clientWidth ?? window.innerWidth;
            const trackWidth = tickerTrackRef.current?.scrollWidth ?? 0;
            const travelDistance = viewportWidth + trackWidth;
            const estimatedDurationSeconds = Math.ceil(travelDistance / 90);
            const nextFontSize = fitTextToWidth(tickerText, {
                maxSize: Math.max(16, Math.round(tickerFontSize * nextViewportScale)),
                minSize: 16,
                maxWidth: viewportWidth,
                fontWeight: '600',
            });

            setTickerDurationSeconds(Math.max(tickerMinDurationSeconds, estimatedDurationSeconds));
            setTickerTextFontSize(nextFontSize);
            setViewportScale(nextViewportScale);
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

                    return stillExists ? current : nextPayload.items[0] ?? null;
                });
            }
        };

        void loadPayload();
        const timer = window.setInterval(() => void loadPayload(), payload.settings.poll_interval_seconds * 1000);

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

            const currentIndex = payload.items.findIndex((item) => item.type === current.type && item.label === current.label && item.text === current.text && item.url === current.url);

            if (currentIndex === -1) {
                return payload.items[0] ?? null;
            }

            return payload.items[(currentIndex + 1) % payload.items.length] ?? payload.items[0] ?? null;
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
                <div
                    key={`${currentItem?.type ?? 'empty'}-${currentItem?.label ?? ''}-${currentItem?.text ?? ''}-${payload.settings.animation_style}-${payload.settings.shape_style}`}
                    className={[
                        'lower-third-shell absolute right-0 left-0 grid overflow-hidden shadow-2xl',
                        payload.settings.shape_style === 'pill' ? 'mx-10 rounded-full' : '',
                        payload.settings.shape_style === 'bar' ? '' : '',
                        payload.settings.shape_style === 'angled' ? '[clip-path:polygon(0_0,98%_0,100%_100%,0_100%)]' : '',
                        isVisible ? `lower-third-in lower-third-${payload.settings.animation_style}` : `lower-third-out lower-third-${payload.settings.animation_style}`,
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
                            useDefaultTickerSkin ? 'absolute' : `relative row-start-1 ${labelColumn}`,
                        ].join(' ')}
                        style={{
                            backgroundColor: useDefaultTickerSkin ? 'transparent' : chromaLabelBackground,
                            color: useDefaultTickerSkin ? '#ffffff' : chromaLabelText,
                            fontSize: `${labelFontSize}px`,
                            paddingInline: `${shellPaddingX}px`,
                            textShadow: useDefaultTickerSkin ? '0 1px 8px rgb(0 0 0 / 0.45)' : undefined,
                            ...defaultSkinLabelStyle,
                        }}
                    >
                        {headlineText}
                    </div>
                    <div
                        ref={tickerViewportRef}
                        className={[
                            'z-0 flex min-w-0 items-center overflow-hidden [direction:ltr]',
                            useDefaultTickerSkin ? 'absolute' : `relative row-start-1 ${tickerColumn}`,
                        ].join(' ')}
                        style={{
                            ...defaultSkinTickerViewportStyle,
                            paddingInlineStart: useDefaultTickerSkin ? undefined : `${shellPaddingX}px`,
                            paddingInlineEnd: useDefaultTickerSkin ? undefined : `${shellPaddingX}px`,
                        }}
                    >
                        <div
                            ref={tickerTrackRef}
                            className="ticker-scroll inline-flex w-max shrink-0 whitespace-nowrap font-semibold tracking-normal"
                            onAnimationEnd={advanceItem}
                            style={{
                                animationDuration: `${tickerDurationSeconds}s`,
                                animationPlayState: isVisible ? 'running' : 'paused',
                                fontSize: `${tickerTextFontSize}px`,
                                paddingInline: `${shellPaddingX}px`,
                                textShadow: useDefaultTickerSkin ? '0 1px 10px rgb(255 255 255 / 0.5)' : undefined,
                            }}
                        >
                            <span>{tickerText}</span>
                        </div>
                    </div>
                    <div className="pointer-events-none z-[1] col-span-full row-start-1 bg-gradient-to-r from-black/30 via-transparent to-transparent" />
                </div>
            </div>
        </>
    );
}
