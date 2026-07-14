import { Head, Link, usePage } from '@inertiajs/react';
import {
    ArrowLeft,
    Calendar,
    ChevronRight,
    Crop,
    Download,
    Frame,
    Lightbulb,
    Maximize2,
    Palette,
    Plus,
    Share2,
    Square,
    User,
} from 'lucide-react';
import { useState } from 'react';
import ThemeSkinPreview from '@/components/ticker/theme-skin-preview';
import type {ThemeMeta} from '@/components/ticker/theme-skin-preview';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { useTranslation } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { dashboard, login } from '@/routes';

type AuthProps = {
    auth: {
        user: { id: number; name?: string | null } | null;
    };
};

type Theme = {
    slug: string;
    value: string;
    label: string;
    url: string;
    author: string | null;
};

type Props = {
    theme: Theme;
    themesUrl: string;
    createThemeUrl: string;
};

type SampleContentItem = {
    headline: string;
    text: string;
};

const FALLBACK_META: ThemeMeta = {
    split_1: 20,
    split_2: 80,
    left_pct: 0,
    right_pct: 100,
    top_pct: 0,
    bottom_pct: 100,
};

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

function buildSampleItems(
    t: (key: MessageKey, params?: Record<string, string | number>) => string,
): SampleContentItem[] {
    return [
        {
            headline: t('themePreviewSampleHeadline1'),
            text: t('themePreviewSampleText1'),
        },
        {
            headline: t('themePreviewSampleHeadline2'),
            text: t('themePreviewSampleText2'),
        },
        {
            headline: t('themePreviewSampleHeadline3'),
            text: t('themePreviewSampleText3'),
        },
    ];
}

function formatPercent(value: number | undefined, fallback: string): string {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return fallback;
    }

    return `${value.toFixed(2)}%`;
}

function formatNumber(value: number | undefined, fallback: string): string {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return fallback;
    }

    return value.toFixed(2);
}

type ThemeMetaWithCreatedAt = ThemeMeta & {
    created_at?: string | null;
};

function formatAuthorDate(meta: ThemeMeta | null): string {
    const createdAt = (meta as ThemeMetaWithCreatedAt | null)?.created_at;

    if (typeof createdAt !== 'string' || createdAt === '') {
        return '—';
    }

    const date = new Date(createdAt.replace(' ', 'T'));

    if (Number.isNaN(date.getTime())) {
        return createdAt;
    }

    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

export default function PublicThemePreview({
    theme,
    themesUrl,
    createThemeUrl,
}: Props) {
    const { t } = useTranslation();
    const { auth } = usePage<AuthProps>().props;
    const canManage = auth.user !== null;
    const [resolvedMeta, setResolvedMeta] = useState<ThemeMeta | null>(null);

    const meta = resolvedMeta ?? FALLBACK_META;
    const items = buildSampleItems(t);

    const partsBasePath = `/ticker-styles/${theme.slug}`;

    return (
        <>
            <Head title={`${theme.label} · ${t('themePreview')}`} />
            <main className="min-h-screen bg-neutral-950 text-white">
                {/*
                  Public-catalog shell — mirrors resources/js/pages/themes/
                  index.tsx for navigation parity so visitors move between
                  the catalog index and this preview without a jarring
                  chrome swap.
                */}
                <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5">
                    <Link href="/" className="flex items-center">
                        <img
                            src="/images/ticker-logo.png"
                            alt="OBS Ticker"
                            className="h-9 w-auto"
                        />
                    </Link>
                    <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                    >
                        <Link href={canManage ? dashboard() : login()}>
                            {canManage ? t('admin') : 'Admin login'}
                        </Link>
                    </Button>
                </header>

                <section className="mx-auto w-full max-w-7xl px-5 pt-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-xs tracking-widest text-neutral-200 uppercase">
                                <Lightbulb className="size-3.5" />
                                {t('themePreview')}
                            </div>
                            <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
                                {theme.label}
                            </h1>
                            <p className="mt-1 max-w-xl text-sm leading-6 text-neutral-300">
                                {theme.author
                                    ? t('themePreviewAuthorLine', {
                                          author: theme.author,
                                      })
                                    : t('themePreviewDescriptionPublic')}
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button asChild variant="outline" size="sm">
                                <Link href={themesUrl}>
                                    <ArrowLeft />
                                    {t('backToThemes')}
                                </Link>
                            </Button>
                            {canManage ? (
                                <Button asChild size="sm">
                                    <Link href={createThemeUrl}>
                                        <Plus />
                                        {t('createAnotherTheme')}
                                    </Link>
                                </Button>
                            ) : null}
                        </div>
                    </div>

                    <div className="mt-6">
                        <ThemeSkinPreview
                            imageUrl={theme.url}
                            items={items}
                            className="h-[clamp(280px,46vw,560px)] w-full"
                            onMetaLoaded={setResolvedMeta}
                        />
                    </div>
                </section>                <section className="mx-auto grid w-full max-w-7xl gap-4 px-5 py-10 lg:grid-cols-[3fr_2fr]">
                    <MetadataOverview meta={meta} itemCount={items.length} />
                    <ThemeDetails meta={meta} theme={theme} partsBasePath={partsBasePath} />
                </section>

                <section className="mx-auto w-full max-w-7xl px-5 pb-12">
                    <PartsDecomposition
                        slug={theme.slug}
                        meta={meta}
                        partsBasePath={partsBasePath}
                        compiledUrl={theme.url}
                    />
                </section>

                <footer className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-5 pt-2 pb-10 text-xs text-neutral-500">
                    <span>{theme.value}</span>
                    <span>{theme.slug}</span>
                </footer>
            </main>
        </>
    );
}

function MetadataOverview({
    meta,
    itemCount,
}: {
    meta: ThemeMeta;
    itemCount: number;
}) {
    const { t } = useTranslation();

    const stampWidth = meta.title_stamp_width_pct;
    const endWidth = meta.end_stamp_width_pct;
    const labelLeft = meta.label_left_pct;
    const labelWidth = meta.label_width_pct;

    const stampArea =
        (typeof stampWidth === 'number' ? stampWidth : 0) +
        (typeof endWidth === 'number' ? endWidth : 0);
    const contentShare = clamp(
        100 - meta.split_1 - (100 - meta.split_2),
        0,
        100,
    );

    return (
        <Card className="border-white/10 bg-white/[0.04] text-white shadow-2xl">
            <CardHeader>
                <div className="flex items-center gap-2">
                    <Frame className="size-4 text-emerald-300" />
                    <CardTitle className="text-white">
                        {t('themePreviewMetaTitle')}
                    </CardTitle>
                </div>
                <CardDescription className="text-neutral-400">
                    {t('themePreviewMetaDescription')}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <CutDiagram
                    meta={meta}
                    stampArea={stampArea}
                    contentShare={contentShare}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                    <MetricCell
                        label={t('themePreviewMetricCuts')}
                        value={`${formatNumber(meta.split_1, '—')}% → ${formatNumber(meta.split_2, '—')}%`}
                        icon={<ChevronRight className="size-4" />}
                    />
                    <MetricCell
                        label={t('themePreviewMetricBBox')}
                        value={t('themePreviewMetricBBoxValue', {
                            left: formatNumber(meta.left_pct, '0'),
                            right: formatNumber(100 - meta.right_pct, '0'),
                            top: formatNumber(meta.top_pct, '0'),
                            bottom: formatNumber(100 - meta.bottom_pct, '0'),
                        })}
                        icon={<Crop className="size-4" />}
                    />
                    <MetricCell
                        label={t('themePreviewMetricLabelRect')}
                        value={t('themePreviewMetricLabelRectValue', {
                            left: formatPercent(labelLeft, '—'),
                            width: formatPercent(labelWidth, '—'),
                        })}
                        icon={<Square className="size-4" />}
                    />
                    <MetricCell
                        label={t('themePreviewMetricStamps')}
                        value={t('themePreviewMetricStampsValue', {
                            title: formatPercent(stampWidth, '—'),
                            end: formatPercent(endWidth, '—'),
                        })}
                        icon={<Palette className="size-4" />}
                    />
                </div>

                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-white/85">
                            <Maximize2 className="size-4" />
                            {t('themePreviewDynamicStretch')}
                        </div>
                        <Badge
                            variant={
                                meta.dynamic_content_stretch === true
                                    ? 'default'
                                    : 'secondary'
                            }
                            className="border-white/10 bg-white/5 text-white"
                        >
                            {meta.dynamic_content_stretch === true
                                ? t('themePreviewDynamicStretchOn')
                                : t('themePreviewDynamicStretchOff')}
                        </Badge>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-neutral-400">
                        {t('themePreviewDynamicStretchDescription', {
                            samples: itemCount,
                        })}
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}

function CutDiagram({
    meta,
    stampArea,
    contentShare,
}: {
    meta: ThemeMeta;
    stampArea: number;
    contentShare: number;
}) {
    const { t } = useTranslation();

    const split1 = clamp(meta.split_1, 0, 100);
    const split2 = clamp(meta.split_2, split1, 100);

    const labelLeft =
        typeof meta.label_left_pct === 'number' ? meta.label_left_pct : 0;
    const labelWidth =
        typeof meta.label_width_pct === 'number' ? meta.label_width_pct : 0;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between text-[11px] tracking-widest text-neutral-400 uppercase">
                <span>{t('themePreviewCutDiagram')}</span>
                <span aria-hidden="true" className="font-mono text-neutral-500">
                    {stampArea.toFixed(2)}% stamp · {contentShare.toFixed(2)}%
                    content
                </span>
            </div>
            <div
                role="img"
                aria-label={t('themePreviewCutDiagramLabel', {
                    split1: split1.toFixed(2),
                    split2: split2.toFixed(2),
                })}
                className="relative h-12 w-full overflow-hidden rounded-md border border-white/10 bg-white/[0.06]"
            >
                <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500/40 to-emerald-500/15"
                    style={{ width: `${split1}%` }}
                />
                <div
                    className="absolute inset-y-0 bg-gradient-to-r from-cyan-500/15 via-cyan-400/5 to-sky-500/15"
                    style={{ left: `${split1}%`, right: `${100 - split2}%` }}
                />
                <div
                    className="absolute inset-y-0 right-0 bg-gradient-to-l from-rose-500/35 to-rose-500/10"
                    style={{ width: `${100 - split2}%` }}
                />
                <div
                    className="absolute inset-y-1 z-10 rounded-sm border border-white/85 bg-white/10"
                    style={{
                        left: `${labelLeft}%`,
                        width: `${labelWidth}%`,
                    }}
                />
                <div
                    aria-hidden="true"
                    className="absolute inset-y-0 z-10 w-px bg-white/70"
                    style={{ left: `${split1}%` }}
                />
                <div
                    aria-hidden="true"
                    className="absolute inset-y-0 z-10 w-px bg-white/70"
                    style={{ left: `${split2}%` }}
                />
            </div>
            <div className="flex items-center justify-between font-mono text-[11px] text-neutral-400">
                <span>0%</span>
                <span>{split1.toFixed(2)}%</span>
                <span>{split2.toFixed(2)}%</span>
                <span>100%</span>
            </div>
        </div>
    );
}

function MetricCell({
    label,
    value,
    icon,
}: {
    label: string;
    value: string;
    icon: React.ReactNode;
}) {
    return (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 text-xs tracking-widest text-neutral-400 uppercase">
                {icon}
                {label}
            </div>
            <div className="mt-2 font-mono text-base font-semibold text-white">
                {value}
            </div>
        </div>
    );
}

function ThemeDetails({
    meta,
    theme,
    partsBasePath,
}: {
    meta: ThemeMeta;
    theme: Theme;
    partsBasePath: string;
}) {
    const { t } = useTranslation();

    return (
        <Card className="border-white/10 bg-white/[0.04] text-white shadow-2xl">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                    <User className="size-4 text-sky-300" />
                    {t('themePreviewDetailsTitle')}
                </CardTitle>
                <CardDescription className="text-neutral-400">
                    {t('themePreviewDetailsDescription')}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4">
                    <div className="grid size-10 place-items-center rounded-md border border-white/10 bg-white/5 text-sm font-semibold text-white">
                        {initialsFor(theme)}
                    </div>
                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">
                            {theme.author ?? t('themePreviewAnonymousAuthor')}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-neutral-400">
                            <Calendar className="size-3" />
                            {t('themePreviewCreatedAt', {
                                date: formatAuthorDate(meta),
                            })}
                        </div>
                    </div>
                </div>

                {meta.dynamic_content_stretch === true ? (
                    <Alert className="border-amber-400/40 bg-amber-500/10 text-amber-100">
                        <Lightbulb className="size-4 text-amber-300" />
                        <AlertTitle>
                            {t('themePreviewDynamicStretchOn')}
                        </AlertTitle>
                        <AlertDescription className="text-xs leading-5 text-amber-100/85">
                            {t('themePreviewDynamicStretchTip')}
                        </AlertDescription>
                    </Alert>
                ) : null}

                <div className="space-y-2">
                    <div className="text-xs tracking-widest text-neutral-400 uppercase">
                        {t('themePreviewFilename')}
                    </div>
                    <div className="flex flex-wrap gap-2 font-mono text-xs">
                        <Badge className="border-white/10 bg-white/5 text-white">
                            {theme.value}
                        </Badge>
                        <Badge className="border-white/10 bg-white/5 text-neutral-300">
                            {theme.slug}
                        </Badge>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        asChild
                        size="sm"
                        variant="default"
                        className="gap-2"
                    >
                        <a href={partsBasePath + '.zip'} download>
                            <Download className="size-4" />
                            {t('downloadThemeZip')}
                        </a>
                    </Button>
                    <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="gap-2 border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                    >
                        <Link href={theme.url} target="_blank" rel="noreferrer">
                            <Share2 className="size-4" />
                            {t('themePreviewOpenRaw')}
                        </Link>
                    </Button>
                    <Button
                        asChild
                        size="sm"
                        variant="ghost"
                        className="gap-2 text-white/85 hover:bg-white/10 hover:text-white"
                    >
                        <Link
                            href={partsBasePath + '/title.png'}
                            target="_blank"
                        >
                            <Maximize2 className="size-4" />
                            {t('themePreviewOpenSource')}
                        </Link>
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

function initialsFor(theme: Theme): string {
    const parts = theme.label.trim().split(/\s+/);

    if (parts.length === 0 || parts[0] === undefined) {
        return '?';
    }

    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }

    const first = parts[0];
    const second = parts[1];

    return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
}

function PartsDecomposition({
    slug,
    meta,
    partsBasePath,
    compiledUrl,
}: {
    slug: string;
    meta: ThemeMeta;
    partsBasePath: string;
    compiledUrl: string;
}) {
    const { t } = useTranslation();

    const parts = [
        {
            label: t('themePreviewPartTitle'),
            filename: 'title.png',
            tone: 'from-emerald-500/30 to-emerald-500/5',
        },
        {
            label: t('themePreviewPartContent'),
            filename: 'content.png',
            tone: 'from-cyan-500/30 to-cyan-500/5',
        },
        {
            label: t('themePreviewPartEnd'),
            filename: 'end.png',
            tone: 'from-rose-500/30 to-rose-500/5',
        },
    ];

    return (
        <Card className="border-white/10 bg-white/[0.04] text-white shadow-2xl">
            <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-white">
                            <Frame className="size-4 text-cyan-300" />
                            {t('themePreviewPartsTitle')}
                        </CardTitle>
                        <CardDescription className="text-neutral-400">
                            {t('themePreviewPartsDescription', { slug })}
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                    {parts.map((part) => (
                        <PartTile
                            key={part.filename}
                            label={part.label}
                            filename={part.filename}
                            tone={part.tone}
                            meta={meta}
                            src={`${partsBasePath}/${part.filename}`}
                            fallbackSrc={compiledUrl}
                        />
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

function PartTile({
    label,
    filename,
    tone,
    src,
    fallbackSrc,
}: {
    label: string;
    filename: string;
    tone: string;
    meta: ThemeMeta;
    src: string;
    fallbackSrc: string;
}) {
    const { t } = useTranslation();
    const [failed, setFailed] = useState(false);

    return (
        <div
            className={cn(
                'group relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br',
                tone,
            )}
        >
            <img
                src={failed ? fallbackSrc : src}
                alt={`${label} — ${filename}`}
                onError={() => setFailed(true)}
                className="absolute inset-0 size-full object-cover transition duration-700 group-hover:scale-110"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-2 p-3">
                <div>
                    <div className="text-[11px] tracking-widest text-neutral-300 uppercase">
                        {label}
                    </div>
                    <div className="font-mono text-xs text-white">
                        {filename}
                    </div>
                </div>
                <span className="rounded-full border border-white/15 bg-black/45 px-2 py-0.5 text-[10px] tracking-widest text-white/85 uppercase backdrop-blur">
                    {t('themePreviewHoverZoom')}
                </span>
            </div>
        </div>
    );
}
