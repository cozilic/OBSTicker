import { Head, Link, router, usePage } from '@inertiajs/react';
import { Check, ExternalLink, FolderOpen, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/lib/i18n';

type Submission = {
    id: number;
    theme_name: string;
    theme_slug: string;
    author_name: string;
    submitter_name: string | null;
    submitter_email: string | null;
    source_type: string;
    source_url: string | null;
    status: string;
    notes: string | null;
    rejection_reason: string | null;
    reviewed_at: string | null;
    published_at: string | null;
    reviewer_name: string | null;
    created_at: string;
};

type PaginatedSubmissions = {
    data: Submission[];
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
    submissions: PaginatedSubmissions;
    officialCatalogUrl: string;
};

export default function ThemeSubmissions({ submissions, officialCatalogUrl }: Props) {
    const { t } = useTranslation();
    const { canModerateThemes } = usePage<{ canModerateThemes: boolean }>().props;

    const handleApprove = (submission: Submission) => {
        router.post(`/ticker-admin/theme-submissions/${submission.id}/approve`);
    };

    const handleReject = (submission: Submission) => {
        const reason = window.prompt(t('rejectionReasonPrompt'));

        router.post(`/ticker-admin/theme-submissions/${submission.id}/reject`, {
            rejection_reason: reason ?? '',
        });
    };

    return (
        <>
            <Head title={t('themeSubmissions')} />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-normal">
                            {t('themeSubmissions')}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {t('themeSubmissionsDescription')}
                        </p>
                    </div>
                    <Button asChild variant="outline">
                        <a href={officialCatalogUrl} target="_blank" rel="noreferrer">
                            <ExternalLink />
                            {t('openOfficialThemesCatalog')}
                        </a>
                    </Button>
                </div>

                {!canModerateThemes ? (
                    <Card className="rounded-lg">
                        <CardHeader>
                            <CardTitle>{t('themeSubmissions')}</CardTitle>
                            <CardDescription>
                                {t('noPermissionToModerateThemes')}
                            </CardDescription>
                        </CardHeader>
                    </Card>
                ) : submissions.data.length === 0 ? (
                    <Card className="rounded-lg">
                        <CardHeader>
                            <CardTitle>{t('themeSubmissions')}</CardTitle>
                            <CardDescription>
                                {t('noSubmissionsPending')}
                            </CardDescription>
                        </CardHeader>
                    </Card>
                ) : (
                    <div className="grid gap-4 xl:grid-cols-2">
                        {submissions.data.map((submission) => (
                            <Card key={submission.id} className="rounded-lg">
                                <CardHeader>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <CardTitle className="truncate">
                                                {submission.theme_name}
                                            </CardTitle>
                                            <CardDescription className="truncate">
                                                {submission.theme_slug}
                                            </CardDescription>
                                        </div>
                                        <Badge
                                            variant={submission.status === 'pending' ? 'secondary' : 'outline'}
                                        >
                                            {t(submission.status as 'pending' | 'approved' | 'rejected')}
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
                                        <div>
                                            <div className="font-medium text-foreground">{t('authorName')}</div>
                                            <div>{submission.author_name}</div>
                                        </div>
                                        <div>
                                            <div className="font-medium text-foreground">{t('submitThemeSubmitterName')}</div>
                                            <div>{submission.submitter_name ?? '-'}</div>
                                        </div>
                                        <div>
                                            <div className="font-medium text-foreground">{t('submitThemeSubmitterEmail')}</div>
                                            <div>{submission.submitter_email ?? '-'}</div>
                                        </div>
                                        <div>
                                            <div className="font-medium text-foreground">{t('source')}</div>
                                            <div>{submission.source_type}</div>
                                        </div>
                                    </div>

                                    {submission.source_url ? (
                                        <div className="flex items-center gap-2 text-sm">
                                            <FolderOpen className="size-4 text-muted-foreground" />
                                            <a
                                                href={submission.source_url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="truncate text-primary hover:underline"
                                            >
                                                {submission.source_url}
                                            </a>
                                        </div>
                                    ) : null}

                                    {submission.notes ? (
                                        <div className="rounded-md border bg-background/50 p-3 text-sm text-muted-foreground">
                                            {submission.notes}
                                        </div>
                                    ) : null}

                                    {submission.rejection_reason ? (
                                        <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-200">
                                            {submission.rejection_reason}
                                        </div>
                                    ) : null}

                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            type="button"
                                            disabled={submission.status !== 'pending'}
                                            onClick={() => handleApprove(submission)}
                                        >
                                            <Check />
                                            {t('approveSubmission')}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            disabled={submission.status !== 'pending'}
                                            onClick={() => handleReject(submission)}
                                        >
                                            <X />
                                            {t('rejectSubmission')}
                                        </Button>
                                    </div>

                                    <div className="text-xs text-muted-foreground">
                                        {t('submittedAt')} {submission.created_at}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}

                {submissions.meta.last_page > 1 ? (
                    <div className="flex items-center justify-between gap-3 border-t pt-3 text-sm">
                        <p className="text-muted-foreground">
                            {submissions.meta.from !== null && submissions.meta.to !== null
                                ? `${submissions.meta.from} - ${submissions.meta.to} / ${submissions.meta.total}`
                                : submissions.meta.total}
                        </p>
                        <div className="flex items-center gap-2">
                            {submissions.meta.prev_page_url !== null ? (
                                <Button asChild variant="outline" size="sm">
                                    <Link href={`/ticker-admin/theme-submissions?page=${submissions.meta.current_page - 1}`}>
                                        {t('previous')}
                                    </Link>
                                </Button>
                            ) : (
                                <Button variant="outline" size="sm" disabled>
                                    {t('previous')}
                                </Button>
                            )}
                            <span className="min-w-20 text-center text-muted-foreground">
                                {submissions.meta.current_page} / {submissions.meta.last_page}
                            </span>
                            {submissions.meta.next_page_url !== null ? (
                                <Button asChild variant="outline" size="sm">
                                    <Link href={`/ticker-admin/theme-submissions?page=${submissions.meta.current_page + 1}`}>
                                        {t('next')}
                                    </Link>
                                </Button>
                            ) : (
                                <Button variant="outline" size="sm" disabled>
                                    {t('next')}
                                </Button>
                            )}
                        </div>
                    </div>
                ) : null}
            </div>
        </>
    );
}
