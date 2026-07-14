import { Head, Link, router, usePage } from '@inertiajs/react';
import { ArrowLeft, Plus, Upload } from 'lucide-react';
import { useState } from 'react';
import {
    FALLBACK_META,
    MetadataOverview,
    PartsDecomposition,
    ThemeDetails,
    buildSampleItems,
    submissionBadgeText,
} from '@/components/ticker/theme-meta-cards';
import ThemeSkinPreview from '@/components/ticker/theme-skin-preview';
import type { ThemeMeta } from '@/components/ticker/theme-skin-preview';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';

type AuthProps = {
    auth: { user: { id: number } | null };
};

type Theme = {
    slug: string;
    value: string;
    label: string;
    url: string;
    author: string | null;
    submissionStatus: 'pending' | 'approved' | 'rejected' | null;
    submissionRejectionReason: string | null;
};

type Props = {
    theme: Theme;
    themesUrl: string;
    createThemeUrl: string;
};

export default function TickerThemePreview({ theme, themesUrl, createThemeUrl }: Props) {
    const { t } = useTranslation();
    const { auth, features } = usePage<AuthProps & {
        features: { themeOfficialCatalogSubmissionEnabled: boolean };
    }>().props;
    const canManageThemes = auth.user !== null;
    const canSubmitToOfficial =
        canManageThemes &&
        features.themeOfficialCatalogSubmissionEnabled &&
        theme.submissionStatus === null;
    const [resolvedMeta, setResolvedMeta] = useState<ThemeMeta | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const meta = resolvedMeta ?? FALLBACK_META;
    const items = buildSampleItems(t);

    const partsBasePath = `/ticker-styles/${theme.slug}`;

    const handleSubmitToOfficial = () => {
        if (isSubmitting) {
            return;
        }

        setIsSubmitting(true);
        router.post(`/ticker-admin/themes/${theme.slug}/submit`, {}, {
            onSuccess: () => router.flushAll(),
            onFinish: () => setIsSubmitting(false),
        });
    };

    return (
        <>
            <Head title={theme.label} />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-2xl font-semibold tracking-normal">
                                {theme.label}
                            </h1>
                            {theme.submissionStatus !== null ? (
                                <Badge
                                    variant={
                                        theme.submissionStatus === 'approved'
                                            ? 'secondary'
                                            : theme.submissionStatus === 'pending'
                                                ? 'outline'
                                                : 'destructive'
                                    }
                                    title={
                                        theme.submissionStatus === 'rejected'
                                            ? (theme.submissionRejectionReason ?? undefined)
                                            : undefined
                                    }
                                >
                                    {submissionBadgeText(theme.submissionStatus, t)}
                                </Badge>
                            ) : (
                                <Badge variant="secondary">{t('done')}</Badge>
                            )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {t('themePreviewDescription')}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">
                            {theme.slug}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button asChild variant="outline">
                            <Link href={themesUrl}>
                                <ArrowLeft />
                                {t('backToThemes')}
                            </Link>
                        </Button>
                        {canManageThemes ? (
                            <Button asChild>
                                <Link href={createThemeUrl}>
                                    <Plus />
                                    {t('createAnotherTheme')}
                                </Link>
                            </Button>
                        ) : null}
                    </div>
                </div>

                <ThemeSkinPreview
                    imageUrl={theme.url}
                    items={items}
                    className="h-[clamp(280px,46vw,560px)] w-full"
                    onMetaLoaded={setResolvedMeta}
                />

                <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[3fr_2fr]">
                    <MetadataOverview meta={meta} itemCount={items.length} />
                    <div className="space-y-4">
                        <ThemeDetails
                            meta={meta}
                            theme={theme}
                            partsBasePath={partsBasePath}
                        />
                        {canSubmitToOfficial ? (
                            <div className="flex justify-end">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={handleSubmitToOfficial}
                                    disabled={isSubmitting}
                                    className="rounded-full"
                                >
                                    <Upload />
                                    {isSubmitting
                                        ? `${t('submitToOfficialThemes')}...`
                                        : t('submitToOfficialThemes')}
                                </Button>
                            </div>
                        ) : null}
                    </div>
                </div>

                <PartsDecomposition
                    slug={theme.slug}
                    partsBasePath={partsBasePath}
                    compiledUrl={theme.url}
                />
            </div>
        </>
    );
}
