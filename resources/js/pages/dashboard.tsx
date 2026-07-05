import { Head, Link } from '@inertiajs/react';
import { MessageSquare, RadioTower, Rss, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from '@/lib/i18n';
import { dashboard } from '@/routes';

type DashboardStats = {
    queuedMessages: number;
    playingMessages: number;
    playedMessages: number;
    todaysSubmissions: number;
    activeRssFeeds: number;
    moderators: number;
};

type LatestMessage = {
    id: number;
    source_type: 'user' | 'admin';
    submitter_name: string | null;
    content: string;
    status: 'queued' | 'playing' | 'played';
    created_at: string;
};

type Props = {
    stats: DashboardStats;
    latestMessages: LatestMessage[];
    submitUrl: string;
};

export default function Dashboard({ stats, latestMessages, submitUrl }: Props) {
    const { t } = useTranslation();
    const statusLabel: Record<LatestMessage['status'], string> = {
        queued: t('queued'),
        playing: t('playing'),
        played: t('done'),
    };

    return (
        <>
            <Head title={t('overview')} />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-normal">{t('overview')}</h1>
                        <p className="text-muted-foreground text-sm">{t('overviewDescription')}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-sm">
                        <Link href={submitUrl} className="rounded-md border px-3 py-2 hover:bg-accent">
                            {t('submissionPage')}
                        </Link>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <StatCard title={t('queued')} value={stats.queuedMessages} description={`${stats.playingMessages} ${t('playingNow')}`} icon={MessageSquare} />
                    <StatCard title={t('todaysSubmissions')} value={stats.todaysSubmissions} description={t('todaysSubmissionsDescription')} icon={RadioTower} />
                    <StatCard title={t('activeRss')} value={stats.activeRssFeeds} description={t('activeRssDescription')} icon={Rss} />
                    <StatCard title={t('moderators')} value={stats.moderators} description={`${stats.playedMessages} ${t('messagesHavePlayed')}`} icon={Users} />
                </div>

                <Card className="rounded-lg">
                    <CardHeader>
                        <CardTitle>{t('latestMessages')}</CardTitle>
                        <CardDescription>{t('latestMessagesDescription')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="divide-y rounded-md border">
                            {latestMessages.length === 0 && <p className="text-muted-foreground p-4 text-sm">{t('noMessagesYet')}</p>}
                            {latestMessages.map((message) => (
                                <div key={message.id} className="grid gap-2 p-4 md:grid-cols-[1fr_auto] md:items-center">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                            <span>{message.source_type === 'user' ? t('user') : t('admin')}</span>
                                            {message.submitter_name && <span>{message.submitter_name}</span>}
                                            <span>{statusLabel[message.status]}</span>
                                        </div>
                                        <p className="mt-1 truncate text-sm">{message.content}</p>
                                    </div>
                                    <span className="text-muted-foreground text-xs">{new Date(message.created_at).toLocaleString()}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

function StatCard({
    title,
    value,
    description,
    icon: Icon,
}: {
    title: string;
    value: number;
    description: string;
    icon: typeof MessageSquare;
}) {
    return (
        <Card className="rounded-lg">
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className="text-muted-foreground size-4" />
            </CardHeader>
            <CardContent>
                <div className="text-3xl font-semibold tracking-normal">{value}</div>
                <p className="text-muted-foreground mt-1 text-sm">{description}</p>
            </CardContent>
        </Card>
    );
}

Dashboard.layout = {
    breadcrumbs: [
        {
            title: 'Overview',
            href: dashboard(),
        },
    ],
};
