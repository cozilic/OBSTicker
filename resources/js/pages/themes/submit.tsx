import { Head, Link, router, usePage } from '@inertiajs/react';
import { ArrowLeft, Send, Upload } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import InputError from '@/components/input-error';
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

type Props = {
    submitUrl: string;
    officialCatalogUrl: string;
};

export default function ThemeSubmit({ submitUrl, officialCatalogUrl }: Props) {
    const { t } = useTranslation();
    const { errors, isOfficialCatalogHost } = usePage<{
        errors: Record<string, string>;
        isOfficialCatalogHost: boolean;
    }>().props;
    const [themeName, setThemeName] = useState('');
    const [authorName, setAuthorName] = useState('');
    const [submitterName, setSubmitterName] = useState('');
    const [submitterEmail, setSubmitterEmail] = useState('');
    const [notes, setNotes] = useState('');
    const [themeZip, setThemeZip] = useState<File | null>(null);
    const [themeUrl, setThemeUrl] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const trimmedUrl = themeUrl.trim();
        const trimmedName = themeName.trim();
        const trimmedAuthor = authorName.trim();

        if (!trimmedName || !trimmedAuthor) {
            return;
        }

        setIsSubmitting(true);

        const payload = new FormData();
        payload.set('theme_name', trimmedName);
        payload.set('author_name', trimmedAuthor);
        payload.set('submitter_name', submitterName.trim());
        payload.set('submitter_email', submitterEmail.trim());
        payload.set('notes', notes.trim());

        if (trimmedUrl !== '') {
            payload.set('theme_url', trimmedUrl);
        } else if (themeZip) {
            payload.set('theme_zip', themeZip);
        }

        router.post(submitUrl, payload, {
            forceFormData: true,
            onFinish: () => setIsSubmitting(false),
        });
    };

    return (
        <>
            <Head title={t('submitTheme')} />
            <main className="min-h-screen bg-neutral-950 text-white">
                <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
                    <div className="space-y-1">
                        <h1 className="text-3xl font-semibold tracking-normal">
                            {t('submitTheme')}
                        </h1>
                        <p className="text-sm text-neutral-300">
                            {t('submitThemeDescription')}
                        </p>
                    </div>
                    <Button asChild variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                        <Link href="/themes">
                            <ArrowLeft />
                            {t('backToThemes')}
                        </Link>
                    </Button>
                </header>

                <section className="mx-auto grid w-full max-w-6xl gap-6 px-5 pb-12 lg:grid-cols-[1fr_0.9fr]">
                    <Card className="rounded-lg border-white/10 bg-white/[0.04]">
                        <CardHeader>
                            <CardTitle>{t('submitTheme')}</CardTitle>
                            <CardDescription>
                                {t('submitThemeFormDescription')}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="theme_name">{t('themeName')}</Label>
                                        <Input
                                            id="theme_name"
                                            value={themeName}
                                            onChange={(event) => setThemeName(event.target.value)}
                                            placeholder="scoreboard-dark"
                                            className="border-white/10 bg-white/[0.03]"
                                        />
                                        <InputError message={errors.theme_name} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="author_name">{t('authorName')}</Label>
                                        <Input
                                            id="author_name"
                                            value={authorName}
                                            onChange={(event) => setAuthorName(event.target.value)}
                                            placeholder="Patrik Forsberg"
                                            className="border-white/10 bg-white/[0.03]"
                                        />
                                        <InputError message={errors.author_name} />
                                    </div>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="submitter_name">
                                            {t('submitThemeSubmitterName')}
                                        </Label>
                                        <Input
                                            id="submitter_name"
                                            value={submitterName}
                                            onChange={(event) => setSubmitterName(event.target.value)}
                                            className="border-white/10 bg-white/[0.03]"
                                        />
                                        <InputError message={errors.submitter_name} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="submitter_email">
                                            {t('submitThemeSubmitterEmail')}
                                        </Label>
                                        <Input
                                            id="submitter_email"
                                            type="email"
                                            value={submitterEmail}
                                            onChange={(event) => setSubmitterEmail(event.target.value)}
                                            className="border-white/10 bg-white/[0.03]"
                                        />
                                        <InputError message={errors.submitter_email} />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="theme_url">{t('submitThemeUrl')}</Label>
                                    <Input
                                        id="theme_url"
                                        type="url"
                                        value={themeUrl}
                                        onChange={(event) => setThemeUrl(event.target.value)}
                                        placeholder="https://example.com/theme.zip"
                                        className="border-white/10 bg-white/[0.03]"
                                    />
                                    <InputError message={errors.theme_url} />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="theme_zip">{t('submitThemeZip')}</Label>
                                    <Input
                                        id="theme_zip"
                                        type="file"
                                        accept=".zip,application/zip"
                                        onChange={(event) => setThemeZip(event.target.files?.[0] ?? null)}
                                        className="border-white/10 bg-white/[0.03]"
                                    />
                                    <InputError message={errors.theme_zip} />
                                    {themeZip ? (
                                        <p className="text-sm text-neutral-300">
                                            {themeZip.name}
                                        </p>
                                    ) : null}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="notes">{t('submitThemeNotes')}</Label>
                                <textarea
                                    id="notes"
                                    value={notes}
                                    onChange={(event) => setNotes(event.target.value)}
                                    placeholder={t('submitThemeNotesPlaceholder')}
                                    className="mt-1 min-h-28 w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                />
                                    <InputError message={errors.notes} />
                                </div>

                                <Button
                                    type="submit"
                                    disabled={isSubmitting || !themeName.trim() || !authorName.trim() || (themeUrl.trim() === '' && !themeZip)}
                                >
                                    {themeZip ? <Upload /> : <Send />}
                                    {t('submitTheme')}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    <div className="space-y-4">
                        <Card className="rounded-lg border-white/10 bg-white/[0.04]">
                            <CardHeader>
                                <CardTitle>{t('officialThemesCatalog')}</CardTitle>
                                <CardDescription>
                                    {t('officialThemesCatalogDescription')}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button asChild variant="outline" className="w-full justify-start border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                                    <a href={officialCatalogUrl}>
                                        {t('openOfficialThemesCatalog')}
                                    </a>
                                </Button>
                            </CardContent>
                        </Card>

                        {isOfficialCatalogHost ? (
                            <Card className="rounded-lg border-white/10 bg-white/[0.04]">
                                <CardHeader>
                                    <CardTitle>{t('submitThemeDescription')}</CardTitle>
                                    <CardDescription>
                                        {t('submitThemeFormDescription')}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="text-sm leading-6 text-neutral-300">
                                    Uploaded archives are stored for review. The submission stays hidden until an owner approves it.
                                </CardContent>
                            </Card>
                        ) : null}
                    </div>
                </section>
            </main>
        </>
    );
}
