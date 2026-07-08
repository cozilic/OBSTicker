import { Head, Link, usePage } from '@inertiajs/react';
import { ArrowLeft, Plus } from 'lucide-react';
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
};

type Props = {
    theme: Theme;
    themesUrl: string;
    createThemeUrl: string;
};

export default function TickerThemePreview({ theme, themesUrl, createThemeUrl }: Props) {
    const { t } = useTranslation();
    const { auth } = usePage<AuthProps>().props;
    const canManageThemes = auth.user !== null;

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
                        <div className="flex flex-wrap gap-2 text-sm">
                            <Badge variant="outline">
                                {t('createdBy')}: {theme.author ?? '-'}
                            </Badge>
                            <Badge variant="outline">
                                {theme.value}
                            </Badge>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}
