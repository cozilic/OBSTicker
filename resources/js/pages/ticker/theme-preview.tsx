import { Head, Link, router, usePage } from '@inertiajs/react';
import { ArrowLeft, Plus, Upload } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
    const [isSubmitting, setIsSubmitting] = useState(false);

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

    const submissionBadgeClass = [
        'rounded-full px-3 py-1',
        theme.submissionStatus === 'pending' ? 'border-border bg-muted text-muted-foreground' : '',
        theme.submissionStatus === 'approved'
            ? 'border-transparent bg-emerald-500/15 text-emerald-500'
            : '',
        theme.submissionStatus === 'rejected' ? 'cursor-help' : '',
    ]
        .filter(Boolean)
        .join(' ');

    const submissionBadgeText =
        theme.submissionStatus === 'pending'
            ? `${t('pending')}...`
            : theme.submissionStatus === 'rejected'
                ? t('denied')
                : t('approved');

    return (
        <>
            <Head title={theme.label} />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-normal">
                            {t('themePreview')}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {t('themePreviewDescription')}
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

                <Card className="rounded-lg">
                    <CardHeader>
                        <div className="flex flex-wrap items-center gap-3">
                            <CardTitle>{theme.label}</CardTitle>
                            <Badge variant="secondary">{t('done')}</Badge>
                        </div>
                        <CardDescription>{theme.slug}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="overflow-hidden rounded-md border bg-background">
                            <img
                                src={theme.url}
                                alt={theme.label}
                                className="h-auto w-full"
                            />
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                            <Badge variant="outline">
                                {t('createdBy')}: {theme.author ?? '-'}
                            </Badge>
                            <Badge variant="outline">{theme.value}</Badge>
                            {theme.submissionStatus ? (
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
                                    className={submissionBadgeClass}
                                >
                                    {submissionBadgeText}
                                </Badge>
                            ) : null}
                            {canSubmitToOfficial ? (
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={handleSubmitToOfficial}
                                    disabled={isSubmitting}
                                    className="ml-auto shrink-0 rounded-full"
                                >
                                    <Upload />
                                    {isSubmitting
                                        ? `${t('submitToOfficialThemes')}...`
                                        : t('submitToOfficialThemes')}
                                </Button>
                            ) : null}
                        </div>
                        {theme.submissionStatus === 'rejected' &&
                        theme.submissionRejectionReason ? (
                            <Alert>
                                <AlertTitle>{t('deniedReason')}</AlertTitle>
                                <AlertDescription>
                                    {theme.submissionRejectionReason}
                                </AlertDescription>
                            </Alert>
                        ) : theme.submissionStatus === 'pending' ? (
                            <Alert>
                                <AlertTitle>{t('pendingSubmission')}</AlertTitle>
                                <AlertDescription>
                                    {t('pendingSubmissionDescription')}
                                </AlertDescription>
                            </Alert>
                        ) : null}
                    </CardContent>
                </Card>
            </div>
        </>
    );
}
