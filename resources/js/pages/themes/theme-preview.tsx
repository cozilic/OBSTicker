import { Head, Link, usePage } from '@inertiajs/react';
import { ArrowLeft, Lightbulb, Plus } from 'lucide-react';
import { useState } from 'react';
import {
    FALLBACK_META,
    MetadataOverview,
    PartsDecomposition,
    ThemeDetails,
    buildSampleItems,
} from '@/components/ticker/theme-meta-cards';
import ThemeSkinPreview from '@/components/ticker/theme-skin-preview';
import type { ThemeMeta } from '@/components/ticker/theme-skin-preview';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';
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
                </section>

                <section className="mx-auto grid w-full max-w-7xl gap-4 px-5 py-10 lg:grid-cols-[3fr_2fr]">
                    <MetadataOverview
                        meta={meta}
                        itemCount={items.length}
                        variant="dark"
                    />
                    <ThemeDetails
                        meta={meta}
                        theme={theme}
                        partsBasePath={partsBasePath}
                        variant="dark"
                    />
                </section>

                <section className="mx-auto w-full max-w-7xl px-5 pb-12">
                    <PartsDecomposition
                        slug={theme.slug}
                        partsBasePath={partsBasePath}
                        compiledUrl={theme.url}
                        variant="dark"
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
