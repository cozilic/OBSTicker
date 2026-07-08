import { Head, Link, router } from '@inertiajs/react';
import { ArrowLeft, Copy, Download, Link2, Share2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useTranslation } from '@/lib/i18n';
import themesRoutes from '@/routes/ticker/themes';
import themeShareRoutes from '@/routes/ticker/themes/share';

type Theme = {
    slug: string;
    value: string;
    label: string;
    url: string;
    author: string | null;
};

type Props = {
    theme: Theme;
    shareUrl: string | null;
    generateShareUrlAction: string;
};

const shareProgressKeys = [
    'shareUrlProgressInitializing',
    'shareUrlProgressCompressingTheme',
    'shareUrlProgressGeneratingArchive',
    'shareUrlProgressGeneratingUrl',
] as const;

export default function TickerThemeShare({
    theme,
    shareUrl,
    generateShareUrlAction,
}: Props) {
    const { t } = useTranslation();
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [shareProgressStep, setShareProgressStep] = useState(0);
    const currentShareUrl = useMemo(() => shareUrl ?? '', [shareUrl]);
    const progressPercentage = useMemo(() => {
        if (currentShareUrl) {
            return 100;
        }

        if (!isGenerating) {
            return 0;
        }

        return Math.round((shareProgressStep / (shareProgressKeys.length - 1)) * 100);
    }, [currentShareUrl, isGenerating, shareProgressStep]);

    useEffect(() => {
        if (!isGenerating) {
            return;
        }

        const timer = window.setInterval(() => {
            setShareProgressStep((current) =>
                Math.min(current + 1, shareProgressKeys.length - 1),
            );
        }, 700);

        return () => window.clearInterval(timer);
    }, [isGenerating]);

    const handleGenerate = () => {
        setIsShareModalOpen(true);
        setShareProgressStep(0);
        setIsGenerating(true);

        router.post(generateShareUrlAction, {}, {
            preserveScroll: true,
            preserveState: true,
            onSuccess: () => setShareProgressStep(shareProgressKeys.length - 1),
            onFinish: () => setIsGenerating(false),
        });
    };

    const handleCopy = async () => {
        if (!currentShareUrl) {
            return;
        }

        await navigator.clipboard.writeText(currentShareUrl);
    };

    return (
        <>
            <Head title={t('shareTheme')} />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-normal">
                            {t('shareTheme')}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {theme.label}
                        </p>
                    </div>
                    <Button asChild variant="outline">
                        <Link href={themesRoutes.index.url()}>
                            <ArrowLeft />
                            {t('backToThemes')}
                        </Link>
                    </Button>
                </div>

                <Card className="rounded-lg">
                    <CardHeader>
                        <CardTitle>{theme.label}</CardTitle>
                        <CardDescription>{theme.slug}</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-3 rounded-md border p-4">
                            <div className="flex items-center gap-2">
                                <Download className="size-4" />
                                <div>
                                    <p className="font-medium">{t('downloadThemeZip')}</p>
                                    <p className="text-sm text-muted-foreground">
                                        {t('downloadThemeZipDescription')}
                                    </p>
                                </div>
                            </div>
                            <Button asChild>
                                <a href={themeShareRoutes.download.url(theme.slug)}>
                                    <Download />
                                    {t('downloadThemeZip')}
                                </a>
                            </Button>
                        </div>

                        <div className="space-y-3 rounded-md border p-4">
                            <div className="flex items-center gap-2">
                                <Share2 className="size-4" />
                                <div>
                                    <p className="font-medium">{t('shareThemeUrl')}</p>
                                    <p className="text-sm text-muted-foreground">
                                        {t('shareThemeUrlDescription')}
                                    </p>
                                </div>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleGenerate}
                                disabled={isGenerating}
                            >
                                <Link2 />
                                {t('generateShareThemeUrl')}
                            </Button>
                            <Alert>
                                <AlertTitle>{t('shareUrlPending')}</AlertTitle>
                                <AlertDescription>
                                    {t('shareUrlPendingDescription')}
                                </AlertDescription>
                            </Alert>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Dialog open={isShareModalOpen} onOpenChange={setIsShareModalOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{t('shareUrlDialogTitle')}</DialogTitle>
                        <DialogDescription>
                            {t('shareUrlDialogDescription')}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-medium">
                                    {t(shareProgressKeys[shareProgressStep])}
                                </p>
                                {isGenerating ? (
                                    <Spinner className="size-4" />
                                ) : (
                                    <Badge variant="secondary">
                                        {t('shareUrlReady')}
                                    </Badge>
                                )}
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-muted">
                                <div
                                    className="h-full rounded-full bg-primary transition-all duration-500"
                                    style={{ width: `${progressPercentage}%` }}
                                />
                            </div>
                        </div>

                        {currentShareUrl ? (
                            <div className="space-y-2">
                                <p className="text-sm text-muted-foreground">
                                    {t('shareUrlReady')}
                                </p>
                                <div className="flex items-center gap-2">
                                    <Input
                                        readOnly
                                        value={currentShareUrl}
                                        className="font-mono text-xs"
                                    />
                                    <Button type="button" size="icon" variant="outline" onClick={handleCopy}>
                                        <Copy />
                                        <span className="sr-only">
                                            {t('copyLink')}
                                        </span>
                                    </Button>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge variant="secondary">
                                        {t('shareUrlReady')}
                                    </Badge>
                                </div>
                            </div>
                        ) : (
                            <Alert>
                                <AlertTitle>{t('shareUrlPending')}</AlertTitle>
                                <AlertDescription>
                                    {t('shareUrlPendingDescription')}
                                </AlertDescription>
                            </Alert>
                        )}
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setIsShareModalOpen(false)}>
                            {t('done')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
