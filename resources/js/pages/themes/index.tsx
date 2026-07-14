import { Head, Link, router, usePage } from '@inertiajs/react';
import { Download, FolderOpen, Link2, LogIn, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import InputError from '@/components/input-error';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useThemeZipSizeGuard } from '@/lib/hooks/use-theme-zip-size-guard';
import { useTranslation } from '@/lib/i18n';
import { dashboard, login } from '@/routes';
import tickerThemesRoutes from '@/routes/ticker/themes';

type Theme = {
    slug: string;
    value: string;
    label: string;
    url: string;
    author: string | null;
    downloadUrl: string;
};

type PaginatedThemes = {
    data: Theme[];
    meta: {
        current_page: number;
        from: number | null;
        last_page: number;
        path: string;
        per_page: number;
        to: number | null;
        total: number;
        first_page_url: string | null;
        last_page_url: string | null;
        next_page_url: string | null;
        prev_page_url: string | null;
    };
};

type Props = {
    themes: PaginatedThemes;
};

export default function PublicThemes({ themes }: Props) {
    const { t } = useTranslation();
    const { auth, errors } = usePage<{
        auth: { user: { id: number } | null };
        errors: Record<string, string>;
    }>().props;
    const [themeImportUrl, setThemeImportUrl] = useState('');
    const [themeZip, setThemeZip] = useState<File | null>(null);
    const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const canImportThemes = auth.user !== null;

    const { error: themeZipError, sizeLabel: themeZipSizeLabel } =
        useThemeZipSizeGuard(themeZip);

    const resetForm = () => {
        setThemeImportUrl('');
        setThemeZip(null);

        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleImport = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (isSubmitting) {
            return;
        }

        const value = themeImportUrl.trim();

        if (!value && !themeZip) {
            return;
        }

        setIsSubmitting(true);

        const formData = new FormData();

        if (value) {
            formData.set('theme_url', value);
        }

        if (themeZip) {
            formData.set('theme_zip', themeZip);
        }

        router.post(tickerThemesRoutes.store.url(), formData, {
            forceFormData: true,
            onSuccess: () => {
                setIsImportDialogOpen(false);
                resetForm();
                router.flushAll();
            },
            onFinish: () => setIsSubmitting(false),
        });
    };

    return (
        <>
            <Head title={t('themes')} />
            <main className="min-h-screen bg-neutral-950 text-white">
                <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
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
                        <Link href={auth.user ? dashboard() : login()}>
                            <LogIn />
                            Admin login
                        </Link>
                    </Button>
                </header>

                <section className="mx-auto w-full max-w-6xl px-5 py-10">
                    <div className="flex flex-col gap-2">
                        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm text-neutral-200">
                            <FolderOpen className="size-4" />
                            Themes catalog
                        </div>
                        <h1 className="text-4xl font-semibold tracking-normal md:text-5xl">
                            {t('themes')}
                        </h1>
                        <p className="max-w-2xl text-base leading-7 text-neutral-300">
                            Browse the official themes catalog, download a zip,
                            or import a theme into your own admin panel.
                        </p>
                    </div>
                    {canImportThemes ? (
                        <div className="mt-6">
                            <Button
                                type="button"
                                size="lg"
                                onClick={() => setIsImportDialogOpen(true)}
                                className="gap-2"
                            >
                                <Plus />
                                {t('addATheme')}
                            </Button>
                        </div>
                    ) : null}
                </section>

                {canImportThemes ? (
                    <Dialog
                        open={isImportDialogOpen}
                        onOpenChange={(open) => {
                            if (isSubmitting && !open) {
                                return;
                            }

                            setIsImportDialogOpen(open);

                            if (!open) {
                                resetForm();
                            }
                        }}
                    >
                        <DialogContent className="sm:max-w-lg">
                            <form onSubmit={handleImport} className="space-y-4">
                                <DialogHeader>
                                    <DialogTitle>{t('addATheme')}</DialogTitle>
                                    <DialogDescription>
                                        {t('themeImportDescription')}
                                    </DialogDescription>
                                </DialogHeader>
                                <div>
                                    <Label htmlFor="theme_url">
                                        {t('themeImportUrl')}
                                    </Label>
                                    <Input
                                        id="theme_url"
                                        name="theme_url"
                                        type="url"
                                        value={themeImportUrl}
                                        disabled={isSubmitting}
                                        onChange={(event) =>
                                            setThemeImportUrl(
                                                event.target.value,
                                            )
                                        }
                                        placeholder="https://example.com/scoreboard.zip"
                                        className="mt-1"
                                    />
                                    <InputError
                                        className="mt-2"
                                        message={errors.theme_url}
                                    />
                                </div>
                                <div
                                    className="relative my-2"
                                    aria-hidden="true"
                                >
                                    <div className="absolute inset-0 flex items-center">
                                        <div className="w-full border-t border-white/10" />
                                    </div>
                                    <div className="relative flex justify-center">
                                        <span className="bg-background px-2 text-xs text-muted-foreground">
                                            {t('orSeparator')}
                                        </span>
                                    </div>
                                </div>{' '}
                                <div>
                                    <Label htmlFor="theme_zip">
                                        {t('themeZip')}
                                    </Label>{' '}
                                    <Input
                                        ref={fileInputRef}
                                        id="theme_zip"
                                        name="theme_zip"
                                        type="file"
                                        accept=".zip,application/zip"
                                        disabled={isSubmitting}
                                        onChange={(event) =>
                                            setThemeZip(
                                                event.target.files?.[0] ?? null,
                                            )
                                        }
                                        className="mt-1"
                                    />
                                    {themeZip ? (
                                        <p
                                            className={`mt-2 text-sm ${themeZipError ? 'text-red-400' : 'text-neutral-400'}`}
                                        >
                                            {themeZip.name} {themeZipSizeLabel}
                                        </p>
                                    ) : null}
                                    <InputError
                                        className="mt-2"
                                        message={
                                            themeZipError ?? errors.theme_zip
                                        }
                                    />
                                </div>
                                <DialogFooter>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() =>
                                            setIsImportDialogOpen(false)
                                        }
                                        disabled={isSubmitting}
                                    >
                                        {t('done')}
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={
                                            isSubmitting ||
                                            (themeImportUrl.trim() === '' &&
                                                !themeZip) ||
                                            themeZipError !== null
                                        }
                                    >
                                        {isSubmitting ? (
                                            <Spinner className="size-4" />
                                        ) : (
                                            <Link2 />
                                        )}
                                        {t('importTheme')}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                ) : null}

                <section className="mx-auto w-full max-w-6xl px-5 pb-12">
                    {themes.data.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.03] p-6 text-neutral-300">
                            {t('themeListEmpty')}
                        </div>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {themes.data.map((theme) => (
                                <Card
                                    key={theme.slug}
                                    className="overflow-hidden rounded-lg border-white/10 bg-white/[0.04]"
                                >
                                    <img
                                        src={theme.url}
                                        alt={theme.label}
                                        className="aspect-video w-full object-cover"
                                    />
                                    <CardHeader>
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <CardTitle className="truncate">
                                                    {theme.label}
                                                </CardTitle>
                                                <CardDescription className="truncate">
                                                    {theme.slug}
                                                </CardDescription>
                                            </div>
                                            {theme.author ? (
                                                <Badge variant="secondary">
                                                    {theme.author}
                                                </Badge>
                                            ) : null}
                                        </div>
                                    </CardHeader>
                                    <CardContent className="flex flex-wrap gap-2">
                                        <Button asChild variant="outline">
                                            <Link
                                                href={`/themes/${theme.slug}`}
                                            >
                                                {t('themePreview')}
                                            </Link>
                                        </Button>
                                        <Button asChild>
                                            <a href={theme.downloadUrl}>
                                                <Download />
                                                {t('downloadThemeZip')}
                                            </a>
                                        </Button>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </section>
            </main>
        </>
    );
}
