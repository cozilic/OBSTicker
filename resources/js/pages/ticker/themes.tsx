import { Head, Link, router, usePage } from '@inertiajs/react';
import {
    ChevronDown,
    Copy,
    Download,
    FolderOpen,
    Link2,
    Plus,
    Share2,
    Trash2,
    Upload,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import InputError from '@/components/input-error';
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
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    themes: Theme[];
    createThemeUrl: string;
};

const shareProgressKeys = [
    'shareUrlProgressInitializing',
    'shareUrlProgressCompressingTheme',
    'shareUrlProgressGeneratingArchive',
    'shareUrlProgressGeneratingUrl',
] as const;

export default function TickerThemes({ themes, createThemeUrl }: Props) {
    const { t } = useTranslation();
    const { errors } = usePage<{ errors: Record<string, string> }>().props;
    const [themeImportUrl, setThemeImportUrl] = useState('');
    const [themeZip, setThemeZip] = useState<File | null>(null);
    const [isImportingUrl, setIsImportingUrl] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [shareTheme, setShareTheme] = useState<Theme | null>(null);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [isGeneratingShareUrl, setIsGeneratingShareUrl] = useState(false);
    const [shareProgressStep, setShareProgressStep] = useState(0);
    const [shareUrl, setShareUrl] = useState('');
    const [shareError, setShareError] = useState('');

    useEffect(() => {
        if (!isGeneratingShareUrl) {
            return;
        }

        const timer = window.setInterval(() => {
            setShareProgressStep((current) =>
                Math.min(current + 1, shareProgressKeys.length - 1),
            );
        }, 700);

        return () => window.clearInterval(timer);
    }, [isGeneratingShareUrl]);

    const handleUrlImport = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const value = themeImportUrl.trim();

        if (!value) {
            return;
        }

        setIsImportingUrl(true);
        router.post(themesRoutes.store.url(), { theme_url: value }, {
            onFinish: () => setIsImportingUrl(false),
        });
    };

    const handleUpload = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!themeZip) {
            return;
        }

        setIsUploading(true);

        const formData = new FormData();
        formData.set('theme_zip', themeZip);

        router.post(themesRoutes.store.url(), formData, {
            forceFormData: true,
            onFinish: () => setIsUploading(false),
        });
    };

    const handleDelete = (theme: Theme) => {
        const confirmed = window.confirm(
            `Delete ${theme.label}? This removes the folder and compiled files.`,
        );

        if (!confirmed) {
            return;
        }

        router.delete(themesRoutes.destroy.url(theme.slug));
    };

    const handleShareUrl = async (theme: Theme) => {
        setShareTheme(theme);
        setIsShareModalOpen(true);
        setIsGeneratingShareUrl(true);
        setShareProgressStep(0);
        setShareUrl('');
        setShareError('');

        const csrfToken =
            typeof document === 'undefined'
                ? ''
                : document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';

        try {
            const response = await fetch(themeShareRoutes.url.url(theme.slug), {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: JSON.stringify({}),
                credentials: 'same-origin',
            });

            if (!response.ok) {
                throw new Error('Unable to generate the share URL.');
            }

            const data = await response.json() as { share_url?: string };
            setShareUrl(data.share_url ?? '');
            setShareProgressStep(shareProgressKeys.length - 1);
        } catch {
            setShareError(t('shareUrlError'));
        } finally {
            setIsGeneratingShareUrl(false);
        }
    };

    return (
        <>
            <Head title={t('themes')} />
            <div className="flex flex-1 flex-col gap-4 p-4 lg:grid lg:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="space-y-4">
                    <Card className="h-fit rounded-lg">
                        <CardHeader>
                            <CardTitle>{t('themes')}</CardTitle>
                            <CardDescription>
                                {t('themesDescription')}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {themes.length === 0 ? (
                                <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                                    <FolderOpen className="size-4 shrink-0" />
                                    <span>{t('themeListEmpty')}</span>
                                </div>
                            ) : (
                                themes.map((theme) => {
                                    const downloadThemeUrl = themeShareRoutes.download.url(theme.slug);

                                    return (
                                        <div
                                            key={theme.slug}
                                            className="rounded-md border p-3"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <Link
                                                        href={themesRoutes.show.url(theme.slug)}
                                                        className="truncate font-medium text-foreground transition-colors hover:text-primary"
                                                    >
                                                        {theme.label}
                                                    </Link>
                                                    <p className="truncate text-xs text-muted-foreground">
                                                        {theme.slug}
                                                    </p>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-2">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="sm"
                                                                className="gap-1.5 px-3"
                                                            >
                                                                <Share2 />
                                                                {t('shareTheme')}
                                                                <ChevronDown />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-52">
                                                            <DropdownMenuLabel>
                                                                {t('shareTheme')}
                                                            </DropdownMenuLabel>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem asChild>
                                                                <a href={downloadThemeUrl}>
                                                                    <Download />
                                                                    <span>{t('downloadThemeZip')}</span>
                                                                </a>
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                onSelect={(event) => {
                                                                    event.preventDefault();
                                                                    void handleShareUrl(theme);
                                                                }}
                                                            >
                                                                <Link2 />
                                                                <span>{t('shareThemeUrl')}</span>
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="outline"
                                                        onClick={() => handleDelete(theme)}
                                                    >
                                                        <Trash2 />
                                                        <span className="sr-only">
                                                            {t('deleteTheme')}
                                                        </span>
                                                    </Button>
                                                </div>
                                            </div>
                                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                                {theme.author ? (
                                                    <Badge variant="secondary">
                                                        {t('createdBy')}: {theme.author}
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline">
                                                        {t('createdBy')}: -
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </CardContent>
                    </Card>
                </aside>

                <div className="space-y-4">
                    <Card className="rounded-lg">
                        <CardHeader>
                            <CardTitle>{t('importTheme')}</CardTitle>
                            <CardDescription>
                                {t('themeImportDescription')}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <form onSubmit={handleUrlImport} className="space-y-4">
                                <div>
                                    <Label htmlFor="theme_url">
                                        {t('themeImportUrl')}
                                    </Label>
                                    <Input
                                        id="theme_url"
                                        name="theme_url"
                                        type="url"
                                        value={themeImportUrl}
                                        onChange={(event) =>
                                            setThemeImportUrl(event.target.value)
                                        }
                                        placeholder="https://example.com/scoreboard.zip"
                                        className="mt-1"
                                    />
                                    <InputError
                                        className="mt-2"
                                        message={errors.theme_url}
                                    />
                                </div>
                                <Button
                                    type="submit"
                                    variant="outline"
                                    disabled={isImportingUrl || themeImportUrl.trim() === ''}
                                >
                                    <Link2 />
                                    {t('importThemeFromUrl')}
                                </Button>
                            </form>

                            <div className="border-t pt-4">
                                <form onSubmit={handleUpload} className="space-y-4">
                                    <div>
                                        <Label htmlFor="theme_zip">
                                            {t('themeZip')}
                                        </Label>
                                        <Input
                                            id="theme_zip"
                                            name="theme_zip"
                                            type="file"
                                            accept=".zip,application/zip"
                                            onChange={(event) =>
                                                setThemeZip(
                                                    event.target.files?.[0] ??
                                                        null,
                                                )
                                            }
                                            className="mt-1"
                                        />
                                        <InputError
                                            className="mt-2"
                                            message={errors.theme_zip}
                                        />
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button
                                            type="submit"
                                            disabled={isUploading || !themeZip}
                                        >
                                            <Upload />
                                            {t('uploadThemeZip')}
                                        </Button>
                                        {themeZip ? (
                                            <span className="text-sm text-muted-foreground">
                                                {themeZip.name}
                                            </span>
                                        ) : null}
                                    </div>
                                </form>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="rounded-lg">
                        <CardHeader>
                            <CardTitle>{t('createTheme')}</CardTitle>
                            <CardDescription>
                                {t('createThemeDescription')}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-wrap items-center gap-2">
                            <Button asChild>
                                <Link href={createThemeUrl}>
                                    <Plus />
                                    {t('createTheme')}
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <Dialog open={isShareModalOpen} onOpenChange={setIsShareModalOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{t('shareUrlDialogTitle')}</DialogTitle>
                        <DialogDescription>
                            {shareTheme ? shareTheme.label : t('shareUrlDialogDescription')}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-medium">
                                    {t(shareProgressKeys[shareProgressStep])}
                                </p>
                                {isGeneratingShareUrl ? (
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
                                    style={{
                                        width: `${Math.round(
                                            (shareProgressStep / (shareProgressKeys.length - 1)) * 100,
                                        )}%`,
                                    }}
                                />
                            </div>
                        </div>

                        {shareError ? (
                            <Alert>
                                <AlertTitle>{t('shareUrlFailed')}</AlertTitle>
                                <AlertDescription>{shareError}</AlertDescription>
                            </Alert>
                        ) : null}

                        {shareUrl ? (
                            <div className="space-y-2">
                                <p className="text-sm text-muted-foreground">
                                    {t('shareUrlReady')}
                                </p>
                                <div className="flex items-center gap-2">
                                    <Input
                                        readOnly
                                        value={shareUrl}
                                        className="font-mono text-xs"
                                    />
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="outline"
                                        onClick={async () => navigator.clipboard.writeText(shareUrl)}
                                    >
                                        <Copy />
                                        <span className="sr-only">
                                            {t('copyLink')}
                                        </span>
                                    </Button>
                                </div>
                            </div>
                        ) : null}
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
