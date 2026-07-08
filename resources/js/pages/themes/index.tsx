import { Head, Link, router, usePage } from '@inertiajs/react';
import { Download, FolderOpen, Link2, LogIn } from 'lucide-react';
import { useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from '@/lib/i18n';
import tickerThemesRoutes from '@/routes/ticker/themes';
import { dashboard, login } from '@/routes';

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
    const canImportThemes = auth.user !== null;

    const handleUrlImport = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const value = themeImportUrl.trim();
        if (!value) {
            return;
        }

        router.post(tickerThemesRoutes.store.url(), { theme_url: value }, {
            onSuccess: () => router.flushAll(),
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
                </section>

                {canImportThemes ? (
                    <section className="mx-auto w-full max-w-6xl px-5 pb-8">
                        <Card className="rounded-lg border-white/10 bg-white/[0.04]">
                            <CardHeader>
                                <CardTitle>{t('importTheme')}</CardTitle>
                                <CardDescription>
                                    {t('themeImportDescription')}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handleUrlImport} className="flex flex-col gap-3 md:flex-row md:items-end">
                                    <div className="flex-1">
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
                                        disabled={themeImportUrl.trim() === ''}
                                    >
                                        <Link2 />
                                        {t('importThemeFromUrl')}
                                    </Button>
                                </form>
                            </CardContent>
                        </Card>
                    </section>
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
                                            <Link href={`/themes/${theme.slug}`}>
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
