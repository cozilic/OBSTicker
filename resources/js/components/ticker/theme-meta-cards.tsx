import {
    Calendar,
    ChevronDown,
    ChevronRight,
    Crop,
    Download,
    Frame,
    Lightbulb,
    Maximize2,
    Palette,
    Square,
    User,
} from 'lucide-react';
import { useState } from 'react';
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTranslation } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { ThemeMeta } from './theme-skin-preview';

export type SampleContentItem = {
    headline: string;
    text: string;
};

export type ThemeCardVariant = 'light' | 'dark';

type ThemeDetailsTheme = {
    slug: string;
    value: string;
    label: string;
    url: string;
    author: string | null;
    submissionStatus?: 'pending' | 'approved' | 'rejected' | null;
    submissionRejectionReason?: string | null;
};

export const FALLBACK_META: ThemeMeta = {
    split_1: 20,
    split_2: 80,
    left_pct: 0,
    right_pct: 100,
    top_pct: 0,
    bottom_pct: 100,
};

export function buildSampleItems(
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

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
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

function cardClasses(variant: ThemeCardVariant): string {
    if (variant === 'dark') {
        return 'border-white/10 bg-white/[0.04] text-white shadow-2xl';
    }

    return 'rounded-lg';
}

function accentIconClass(
    variant: ThemeCardVariant,
    tone: 'emerald' | 'sky' | 'cyan',
): string {
    if (variant === 'dark') {
        switch (tone) {
            case 'emerald':
                return 'text-emerald-300';
            case 'sky':
                return 'text-sky-300';
            case 'cyan':
                return 'text-cyan-300';
        }
    }

    return 'text-muted-foreground';
}

function cardHeaderTextClass(variant: ThemeCardVariant): string {
    return variant === 'dark' ? 'text-white' : '';
}

function cardHeaderDescriptionClass(variant: ThemeCardVariant): string {
    return variant === 'dark' ? 'text-neutral-400' : 'text-muted-foreground';
}

function metricCellClasses(variant: ThemeCardVariant): string {
    if (variant === 'dark') {
        return 'rounded-lg border border-white/10 bg-white/[0.03] p-4';
    }

    return 'rounded-lg border bg-muted/40 p-4';
}

function metricCellLabelClass(variant: ThemeCardVariant): string {
    return variant === 'dark'
        ? 'text-xs tracking-widest text-neutral-400 uppercase'
        : 'text-xs tracking-widest text-muted-foreground uppercase';
}

function metricCellValueClass(variant: ThemeCardVariant): string {
    return variant === 'dark'
        ? 'mt-2 font-mono text-base font-semibold text-white'
        : 'mt-2 font-mono text-base font-semibold';
}

function dynamicStretchRowClasses(variant: ThemeCardVariant): string {
    if (variant === 'dark') {
        return 'rounded-lg border border-white/10 bg-white/[0.03] p-4';
    }

    return 'rounded-lg border bg-muted/30 p-4';
}

function dynamicStretchBadgeClasses(variant: ThemeCardVariant): string {
    return variant === 'dark'
        ? 'border-white/10 bg-white/5 text-white'
        : 'border-border bg-background text-foreground';
}

function dynamicStretchTipClass(variant: ThemeCardVariant): string {
    return variant === 'dark' ? 'text-white/85' : '';
}

function dynamicStretchTipDescriptionClass(variant: ThemeCardVariant): string {
    return variant === 'dark'
        ? 'mt-2 text-xs leading-5 text-neutral-400'
        : 'mt-2 text-xs leading-5 text-muted-foreground';
}

function themeDetailsHeaderBgClass(variant: ThemeCardVariant): string {
    return variant === 'dark'
        ? 'flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4'
        : 'flex items-center gap-3 rounded-lg border bg-muted/40 p-4';
}

function themeDetailsInitialsBgClass(variant: ThemeCardVariant): string {
    return variant === 'dark'
        ? 'grid size-10 place-items-center rounded-md border border-white/10 bg-white/5 text-sm font-semibold text-white'
        : 'grid size-10 place-items-center rounded-md border bg-background text-sm font-semibold';
}

function themeDetailsAuthorNameClass(variant: ThemeCardVariant): string {
    return variant === 'dark'
        ? 'truncate text-sm font-semibold text-white'
        : 'truncate text-sm font-semibold';
}

function themeDetailsAuthorDateClass(variant: ThemeCardVariant): string {
    return variant === 'dark'
        ? 'flex items-center gap-1 text-xs text-neutral-400'
        : 'flex items-center gap-1 text-xs text-muted-foreground';
}

function themeDetailsFilenameLabelClass(variant: ThemeCardVariant): string {
    return variant === 'dark'
        ? 'text-xs tracking-widest text-neutral-400 uppercase'
        : 'text-xs tracking-widest text-muted-foreground uppercase';
}

function themeDetailsFilenameBadgeClass(variant: ThemeCardVariant): string {
    return variant === 'dark'
        ? 'border-white/10 bg-white/5 text-white'
        : 'border-border bg-background text-foreground';
}

function themeDetailsFilenameSlugBadgeClass(variant: ThemeCardVariant): string {
    return variant === 'dark'
        ? 'border-white/10 bg-white/5 text-neutral-300'
        : 'border-border bg-muted text-muted-foreground';
}

export function submissionBadgeText(
    status: 'pending' | 'approved' | 'rejected' | null,
    t: (key: MessageKey) => string,
): string {
    if (status === 'pending') {
        return `${t('pending')}...`;
    }

    if (status === 'rejected') {
        return t('denied');
    }

    return t('approved');
}

function renderSubmissionBadge(
    theme: ThemeDetailsTheme,
    variant: ThemeCardVariant,
    t: (key: MessageKey) => string,
) {
    if (theme.submissionStatus === null || theme.submissionStatus === undefined) {
        return null;
    }

    const variantBadge =
        theme.submissionStatus === 'approved'
            ? 'secondary'
            : theme.submissionStatus === 'pending'
                ? 'outline'
                : 'destructive';

    const extraClasses = [
        'rounded-full px-3 py-1',
        theme.submissionStatus === 'pending'
            ? variant === 'dark'
                ? 'border-border bg-white/[0.04] text-neutral-300'
                : 'border-border bg-muted text-muted-foreground'
            : '',
        theme.submissionStatus === 'approved'
            ? variant === 'dark'
                ? 'border-transparent bg-emerald-500/15 text-emerald-300'
                : 'border-transparent bg-emerald-500/15 text-emerald-700'
            : '',
        theme.submissionStatus === 'rejected' ? 'cursor-help' : '',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <Badge
            variant={variantBadge}
            title={
                theme.submissionStatus === 'rejected'
                    ? (theme.submissionRejectionReason ?? undefined)
                    : undefined
            }
            className={extraClasses}
        >
            {submissionBadgeText(theme.submissionStatus, t)}
        </Badge>
    );
}

function renderSubmissionAlert(theme: ThemeDetailsTheme, t: (key: MessageKey) => string) {
    if (theme.submissionStatus === 'rejected' && theme.submissionRejectionReason) {
        return (
            <Alert>
                <AlertTitle>{t('deniedReason')}</AlertTitle>
                <AlertDescription>
                    {theme.submissionRejectionReason}
                </AlertDescription>
            </Alert>
        );
    }

    if (theme.submissionStatus === 'pending') {
        return (
            <Alert>
                <AlertTitle>{t('pendingSubmission')}</AlertTitle>
                <AlertDescription>
                    {t('pendingSubmissionDescription')}
                </AlertDescription>
            </Alert>
        );
    }

    return null;
}

function initialsFor(label: string): string {
    const parts = label.trim().split(/\s+/);

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

function CutDiagram({
    meta,
    stampArea,
    contentShare,
    variant,
}: {
    meta: ThemeMeta;
    stampArea: number;
    contentShare: number;
    variant: ThemeCardVariant;
}) {
    const { t } = useTranslation();

    const split1 = clamp(meta.split_1, 0, 100);
    const split2 = clamp(meta.split_2, split1, 100);

    const labelLeft =
        typeof meta.label_left_pct === 'number' ? meta.label_left_pct : 0;
    const labelWidth =
        typeof meta.label_width_pct === 'number' ? meta.label_width_pct : 0;

    const isDark = variant === 'dark';

    return (
        <div className="space-y-3">
            <div
                className={cn(
                    'flex items-center justify-between text-[11px] tracking-widest uppercase',
                    isDark ? 'text-neutral-400' : 'text-muted-foreground',
                )}
            >
                <span>{t('themePreviewCutDiagram')}</span>
                <span
                    aria-hidden="true"
                    className={cn(
                        'font-mono',
                        isDark ? 'text-neutral-500' : 'text-muted-foreground/80',
                    )}
                >
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
                className={cn(
                    'relative h-12 w-full overflow-hidden rounded-md border',
                    isDark
                        ? 'border-white/10 bg-white/[0.06]'
                        : 'border-border bg-background',
                )}
            >
                <div
                    className={cn(
                        'absolute inset-y-0 left-0',
                        isDark
                            ? 'bg-gradient-to-r from-emerald-500/40 to-emerald-500/15'
                            : 'bg-gradient-to-r from-emerald-500/30 to-emerald-500/15',
                    )}
                    style={{ width: `${split1}%` }}
                />
                <div
                    className={cn(
                        'absolute inset-y-0',
                        isDark
                            ? 'bg-gradient-to-r from-cyan-500/15 via-cyan-400/5 to-sky-500/15'
                            : 'bg-gradient-to-r from-cyan-500/20 via-cyan-400/10 to-sky-500/20',
                    )}
                    style={{ left: `${split1}%`, right: `${100 - split2}%` }}
                />
                <div
                    className={cn(
                        'absolute inset-y-0 right-0',
                        isDark
                            ? 'bg-gradient-to-l from-rose-500/35 to-rose-500/10'
                            : 'bg-gradient-to-l from-rose-500/30 to-rose-500/10',
                    )}
                    style={{ width: `${100 - split2}%` }}
                />
                <div
                    className={cn(
                        'absolute inset-y-1 z-10 rounded-sm border bg-white/10',
                        isDark ? 'border-white/85' : 'border-foreground/30',
                    )}
                    style={{
                        left: `${labelLeft}%`,
                        width: `${labelWidth}%`,
                    }}
                />
                <div
                    aria-hidden="true"
                    className={cn(
                        'absolute inset-y-0 z-10 w-px',
                        isDark ? 'bg-white/70' : 'bg-foreground/60',
                    )}
                    style={{ left: `${split1}%` }}
                />
                <div
                    aria-hidden="true"
                    className={cn(
                        'absolute inset-y-0 z-10 w-px',
                        isDark ? 'bg-white/70' : 'bg-foreground/60',
                    )}
                    style={{ left: `${split2}%` }}
                />
            </div>
            <div
                className={cn(
                    'flex items-center justify-between font-mono text-[11px]',
                    isDark ? 'text-neutral-400' : 'text-muted-foreground',
                )}
            >
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
    variant,
}: {
    label: string;
    value: string;
    icon: React.ReactNode;
    variant: ThemeCardVariant;
}) {
    return (
        <div className={metricCellClasses(variant)}>
            <div className={metricCellLabelClass(variant)}>
                {icon}
                {label}
            </div>
            <div className={metricCellValueClass(variant)}>{value}</div>
        </div>
    );
}

export function MetadataOverview({
    meta,
    itemCount,
    variant = 'light',
}: {
    meta: ThemeMeta;
    itemCount: number;
    variant?: ThemeCardVariant;
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
        <Card className={cardClasses(variant)}>
            <CardHeader>
                <div className="flex items-center gap-2">
                    <Frame className={cn('size-4', accentIconClass(variant, 'emerald'))} />
                    <CardTitle className={cardHeaderTextClass(variant)}>
                        {t('themePreviewMetaTitle')}
                    </CardTitle>
                </div>
                <CardDescription className={cardHeaderDescriptionClass(variant)}>
                    {t('themePreviewMetaDescription')}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <CutDiagram
                    meta={meta}
                    stampArea={stampArea}
                    contentShare={contentShare}
                    variant={variant}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                    <MetricCell
                        label={t('themePreviewMetricCuts')}
                        value={`${formatNumber(meta.split_1, '—')}% → ${formatNumber(meta.split_2, '—')}%`}
                        icon={<ChevronRight className="size-4" />}
                        variant={variant}
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
                        variant={variant}
                    />
                    <MetricCell
                        label={t('themePreviewMetricLabelRect')}
                        value={t('themePreviewMetricLabelRectValue', {
                            left: formatPercent(labelLeft, '—'),
                            width: formatPercent(labelWidth, '—'),
                        })}
                        icon={<Square className="size-4" />}
                        variant={variant}
                    />
                    <MetricCell
                        label={t('themePreviewMetricStamps')}
                        value={t('themePreviewMetricStampsValue', {
                            title: formatPercent(stampWidth, '—'),
                            end: formatPercent(endWidth, '—'),
                        })}
                        icon={<Palette className="size-4" />}
                        variant={variant}
                    />
                </div>

                <div className={dynamicStretchRowClasses(variant)}>
                    <div className="flex items-center justify-between gap-3">
                        <div
                            className={cn(
                                'flex items-center gap-2 text-sm font-medium',
                                variant === 'dark' ? 'text-white/85' : '',
                            )}
                        >
                            <Maximize2 className="size-4" />
                            {t('themePreviewDynamicStretch')}
                        </div>
                        <Badge
                            variant={
                                meta.dynamic_content_stretch === true
                                    ? 'default'
                                    : 'secondary'
                            }
                            className={dynamicStretchBadgeClasses(variant)}
                        >
                            {meta.dynamic_content_stretch === true
                                ? t('themePreviewDynamicStretchOn')
                                : t('themePreviewDynamicStretchOff')}
                        </Badge>
                    </div>
                    <p className={dynamicStretchTipDescriptionClass(variant)}>
                        {t('themePreviewDynamicStretchDescription', {
                            samples: itemCount,
                        })}
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}

export function ThemeDetails({
    meta,
    theme,
    partsBasePath,
    variant = 'light',
}: {
    meta: ThemeMeta;
    theme: ThemeDetailsTheme;
    partsBasePath: string;
    variant?: ThemeCardVariant;
}) {
    const { t } = useTranslation();

    const isDark = variant === 'dark';

    return (
        <Card className={cardClasses(variant)}>
            <CardHeader>
                <CardTitle
                    className={cn(
                        'flex items-center gap-2',
                        cardHeaderTextClass(variant),
                    )}
                >
                    <User
                        className={cn('size-4', accentIconClass(variant, 'sky'))}
                    />
                    {t('themePreviewDetailsTitle')}
                </CardTitle>
                <CardDescription className={cardHeaderDescriptionClass(variant)}>
                    {t('themePreviewDetailsDescription')}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <div className={themeDetailsHeaderBgClass(variant)}>
                    <div className={themeDetailsInitialsBgClass(variant)}>
                        {initialsFor(theme.label)}
                    </div>
                    <div className="min-w-0">
                        <div className={themeDetailsAuthorNameClass(variant)}>
                            {theme.author ?? t('themePreviewAnonymousAuthor')}
                        </div>
                        <div className={themeDetailsAuthorDateClass(variant)}>
                            <Calendar className="size-3" />
                            {t('themePreviewCreatedAt', {
                                date: formatAuthorDate(meta),
                            })}
                        </div>
                    </div>
                </div>

                {meta.dynamic_content_stretch === true ? (
                    <Alert
                        className={cn(
                            isDark
                                ? 'border-amber-400/40 bg-amber-500/10 text-amber-100'
                                : 'border-amber-400/40 bg-amber-500/10 text-amber-900',
                        )}
                    >
                        <Lightbulb
                            className={cn(
                                'size-4',
                                isDark ? 'text-amber-300' : 'text-amber-600',
                            )}
                        />
                        <AlertTitle className={dynamicStretchTipClass(variant)}>
                            {t('themePreviewDynamicStretchOn')}
                        </AlertTitle>
                        <AlertDescription
                            className={cn(
                                'text-xs leading-5',
                                isDark
                                    ? 'text-amber-100/85'
                                    : 'text-amber-900/80',
                            )}
                        >
                            {t('themePreviewDynamicStretchTip')}
                        </AlertDescription>
                    </Alert>
                ) : null}

                {renderSubmissionAlert(theme, t)}

                <div className="space-y-2">
                    <div className={themeDetailsFilenameLabelClass(variant)}>
                        {t('themePreviewFilename')}
                    </div>
                    <div className="flex flex-wrap gap-2 font-mono text-xs">
                        <Badge className={themeDetailsFilenameBadgeClass(variant)}>
                            {theme.value}
                        </Badge>
                        <Badge
                            className={themeDetailsFilenameSlugBadgeClass(variant)}
                        >
                            {theme.slug}
                        </Badge>
                        {renderSubmissionBadge(theme, variant, t)}
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
                        variant={isDark ? 'outline' : 'outline'}
                        className={cn(
                            'gap-2',
                            isDark
                                ? 'border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white'
                                : '',
                        )}
                    >
                        <a href={theme.url} target="_blank" rel="noreferrer">
                            {t('themePreviewOpenRaw')}
                        </a>
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                size="sm"
                                variant="ghost"
                                className={cn(
                                    'gap-2',
                                    isDark
                                        ? 'text-white/85 hover:bg-white/10 hover:text-white'
                                        : '',
                                )}
                            >
                                {t('themePreviewOpenSource')}
                                <ChevronDown className="size-3 opacity-60" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                                <a
                                    href={`${partsBasePath}/title.png`}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    title.png
                                </a>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                                <a
                                    href={`${partsBasePath}/content.png`}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    content.png
                                </a>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                                <a
                                    href={`${partsBasePath}/end.png`}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    end.png
                                </a>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
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
    src: string;
    fallbackSrc: string;
}) {
    const [failed, setFailed] = useState(false);

    return (
        <div
            className={cn(
                'group relative aspect-[1/1] overflow-hidden rounded-lg border bg-checker bg-gradient-to-br',
                tone,
            )}
        >
            <img
                src={failed ? fallbackSrc : src}
                alt={`${label} — ${filename}`}
                onError={() => setFailed(true)}
                className="absolute inset-0 size-full object-contain"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-2 p-3">
                <div>
                    <div className="text-[11px] tracking-widest text-neutral-300 uppercase">
                        {label}
                    </div>
                    <div className="font-mono text-xs text-white">
                        {filename}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function PartsDecomposition({
    slug,
    partsBasePath,
    compiledUrl,
    variant = 'light',
}: {
    slug: string;
    partsBasePath: string;
    compiledUrl: string;
    variant?: ThemeCardVariant;
}) {
    const { t } = useTranslation();

    const isDark = variant === 'dark';

    const parts = [
        {
            label: t('themePreviewPartTitle'),
            filename: 'title.png',
            tone: isDark
                ? 'from-emerald-500/30 to-emerald-500/5'
                : 'from-emerald-500/10 to-emerald-500/5',
        },
        {
            label: t('themePreviewPartContent'),
            filename: 'content.png',
            tone: isDark
                ? 'from-cyan-500/30 to-cyan-500/5'
                : 'from-cyan-500/10 to-cyan-500/5',
        },
        {
            label: t('themePreviewPartEnd'),
            filename: 'end.png',
            tone: isDark
                ? 'from-rose-500/30 to-rose-500/5'
                : 'from-rose-500/10 to-rose-500/5',
        },
    ];

    return (
        <Card className={cardClasses(variant)}>
            <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <CardTitle
                            className={cn(
                                'flex items-center gap-2',
                                cardHeaderTextClass(variant),
                            )}
                        >
                            <Frame
                                className={cn(
                                    'size-4',
                                    accentIconClass(variant, 'cyan'),
                                )}
                            />
                            {t('themePreviewPartsTitle')}
                        </CardTitle>
                        <CardDescription
                            className={cardHeaderDescriptionClass(variant)}
                        >
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
                            src={`${partsBasePath}/${part.filename}`}
                            fallbackSrc={compiledUrl}
                        />
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

// Re-export Share2 silently — admin ThemeDetails doesn't need it yet,
// but ThemeDetailsTheme has the optional fields in case other readers
// want to wire it in. Avoids ESLint unused-imports complaints later.

