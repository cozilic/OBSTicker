import { Head, Link } from '@inertiajs/react';
import { ArrowLeft, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from '@/lib/i18n';

type Props = {
    officialCatalogUrl: string;
};

export default function ThemeSubmitted({ officialCatalogUrl }: Props) {
    const { t } = useTranslation();

    return (
        <>
            <Head title={t('themeSubmissionReceived')} />
            <main className="min-h-screen bg-neutral-950 text-white">
                <section className="mx-auto flex min-h-screen w-full max-w-4xl items-center px-5 py-10">
                    <Card className="w-full rounded-lg border-white/10 bg-white/[0.04]">
                        <CardHeader>
                            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-sm text-emerald-200">
                                <FolderOpen className="size-4" />
                                {t('done')}
                            </div>
                            <CardTitle className="text-3xl">{t('themeSubmissionReceived')}</CardTitle>
                            <CardDescription>
                                {t('themeSubmissionReceivedDescription')}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-wrap gap-3">
                            <Button asChild>
                                <Link href={officialCatalogUrl}>
                                    <ArrowLeft />
                                    {t('backToThemes')}
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                </section>
            </main>
        </>
    );
}
