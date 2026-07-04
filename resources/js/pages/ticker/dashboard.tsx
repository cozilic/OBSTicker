import { Form, Head } from '@inertiajs/react';
import { Copy, ExternalLink, Plus, RadioTower, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useClipboard } from '@/hooks/use-clipboard';
import { dashboard as tickerDashboard } from '@/routes/ticker';
import { store as storeMessage, destroy as destroyMessage } from '@/routes/ticker/messages';
import { store as storeModerator } from '@/routes/ticker/moderators';
import { store as storeRssFeed, destroy as destroyRssFeed } from '@/routes/ticker/rss-feeds';
import { update as updateSettings } from '@/routes/ticker/settings';

type TickerMessage = {
    id: number;
    source_type: 'user' | 'admin';
    submitter_name: string | null;
    source_label: string | null;
    content: string;
    status: 'queued' | 'playing' | 'played';
    is_active: boolean;
    sort_order: number;
};

type RssFeed = {
    id: number;
    name: string;
    url: string;
    is_active: boolean;
    item_limit: number;
    refresh_minutes: number;
    last_checked_at: string | null;
};

type TickerSettings = {
    headline: string;
    rss_headline: string;
    user_headline: string;
    background_color: string;
    text_color: string;
    accent_color: string;
    canvas_width: number;
    canvas_height: number;
    animation_style: 'slide-left' | 'fade' | 'bounce' | 'zoom';
    animation_duration_seconds: number;
    animation_out_duration_seconds: number;
    shape_style: 'bar' | 'pill' | 'angled';
    label_position: 'left' | 'right';
    chroma_key_color: 'green' | 'blue' | 'magenta';
    image_url: string | null;
    crawl_duration_seconds: number;
    message_display_seconds: number;
    poll_interval_seconds: number;
    show_rss: boolean;
};

type Props = {
    messages: TickerMessage[];
    rssFeeds: RssFeed[];
    settings: TickerSettings;
    moderators: {
        id: number;
        name: string;
        email: string;
        role: 'owner' | 'moderator';
    }[];
    canManageModerators: boolean;
    tickerUrl: string;
    submitUrl: string;
};

export default function TickerDashboard({ messages, rssFeeds, settings, moderators, canManageModerators, tickerUrl, submitUrl }: Props) {
    const [, copyToClipboard] = useClipboard();
    const queuedMessages = messages.filter((message) => message.status === 'queued').length;
    const playingMessage = messages.find((message) => message.status === 'playing');
    const chromaTickerUrl = `${tickerUrl}${tickerUrl.includes('?') ? '&' : '?'}chroma=1`;
    const hasPreviewImage = Boolean(settings.image_url);
    const previewLabelIsRight = settings.label_position === 'right';
    const previewColumns = previewLabelIsRight
        ? hasPreviewImage
            ? 'grid-cols-[1fr_170px_72px]'
            : 'grid-cols-[1fr_170px]'
        : hasPreviewImage
            ? 'grid-cols-[72px_170px_1fr]'
            : 'grid-cols-[170px_1fr]';
    const previewImageColumn = previewLabelIsRight ? 'col-start-3' : 'col-start-1';
    const previewLabelColumn = previewLabelIsRight ? 'col-start-2' : hasPreviewImage ? 'col-start-2' : 'col-start-1';
    const previewTextColumn = previewLabelIsRight ? 'col-start-1' : hasPreviewImage ? 'col-start-3' : 'col-start-2';

    return (
        <>
            <Head title="Ticker" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-normal">OBS Ticker</h1>
                        <p className="text-muted-foreground text-sm">
                            Lower-third för OBS Browser Source. {queuedMessages} i kö
                            {playingMessage ? `, spelar: ${playingMessage.content}` : ', RSS används när kön är tom'}.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" size="sm" asChild>
                            <a href={submitUrl} target="_blank" rel="noreferrer">
                                <ExternalLink />
                                Inskickssida
                            </a>
                        </Button>
                    </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="flex flex-col gap-4">
                        <Card className="rounded-lg">
                            <CardHeader>
                                <CardTitle>Manuella texter</CardTitle>
                                <CardDescription>Skicka in korta meddelanden som visas före RSS-rubriker.</CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-4">
                                <Form {...storeMessage.form()} resetOnSuccess className="grid gap-3 md:grid-cols-[1fr_150px_110px_auto]">
                                    {({ errors, processing }) => (
                                        <>
                                            <div className="md:col-span-4">
                                                <Label htmlFor="content">Admintext till kön</Label>
                                                <textarea
                                                    id="content"
                                                    name="content"
                                                    rows={3}
                                                    className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 mt-1 flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                                                    placeholder="Skriv texten som ska rulla i lower-third..."
                                                />
                                                {errors.content && <p className="text-destructive mt-1 text-sm">{errors.content}</p>}
                                            </div>
                                            <div>
                                                <Label htmlFor="source_label">Etikett</Label>
                                                <Input id="source_label" name="source_label" placeholder="Studio" />
                                            </div>
                                            <div>
                                                <Label htmlFor="sort_order">Ordning</Label>
                                                <Input id="sort_order" name="sort_order" type="number" min="0" defaultValue="0" />
                                            </div>
                                            <label className="flex items-center gap-2 pt-6 text-sm">
                                                <input type="hidden" name="is_active" value="0" />
                                                <Checkbox name="is_active" value="1" defaultChecked />
                                                Aktiv
                                            </label>
                                            <div className="pt-6">
                                                <Button type="submit" disabled={processing}>
                                                    <Plus />
                                                    Lägg till
                                                </Button>
                                            </div>
                                        </>
                                    )}
                                </Form>

                                <div className="divide-y rounded-md border">
                                    {messages.length === 0 && <p className="text-muted-foreground p-4 text-sm">Inga meddelanden ännu.</p>}
                                    {messages.map((message) => (
                                        <div key={message.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-muted-foreground text-xs">{message.source_type === 'user' ? 'Användare' : 'Admin'}</span>
                                                    {(message.submitter_name || message.source_label) && (
                                                        <span className="text-muted-foreground text-xs">{message.submitter_name ?? message.source_label}</span>
                                                    )}
                                                    <span className="text-muted-foreground text-xs">#{message.sort_order}</span>
                                                    <span className="text-muted-foreground text-xs">
                                                        {message.status === 'queued' ? 'I kö' : message.status === 'playing' ? 'Spelas nu' : 'Klar'}
                                                    </span>
                                                    {!message.is_active && <span className="text-destructive text-xs">Inaktiv</span>}
                                                </div>
                                                <p className="mt-1 text-sm">{message.content}</p>
                                            </div>
                                            <Form {...destroyMessage.form(message.id)}>
                                                <Button variant="ghost" size="icon" type="submit" aria-label="Ta bort meddelande">
                                                    <Trash2 />
                                                </Button>
                                            </Form>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="rounded-lg">
                            <CardHeader>
                                <CardTitle>RSS-källor</CardTitle>
                                <CardDescription>Rubriker hämtas server-side med cache och blandas in efter manuella texter.</CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-4">
                                <Form {...storeRssFeed.form()} resetOnSuccess className="grid gap-3 md:grid-cols-[180px_1fr_120px_140px_auto]">
                                    {({ errors, processing }) => (
                                        <>
                                            <div>
                                                <Label htmlFor="name">Namn</Label>
                                                <Input id="name" name="name" placeholder="SVT" />
                                                {errors.name && <p className="text-destructive mt-1 text-sm">{errors.name}</p>}
                                            </div>
                                            <div>
                                                <Label htmlFor="url">RSS URL</Label>
                                                <Input id="url" name="url" type="url" placeholder="https://..." />
                                                {errors.url && <p className="text-destructive mt-1 text-sm">{errors.url}</p>}
                                            </div>
                                            <div>
                                                <Label htmlFor="item_limit">Antal</Label>
                                                <Input id="item_limit" name="item_limit" type="number" min="1" max="20" defaultValue="5" />
                                            </div>
                                            <div>
                                                <Label htmlFor="refresh_minutes">Cache min</Label>
                                                <Input id="refresh_minutes" name="refresh_minutes" type="number" min="5" max="180" defaultValue="15" />
                                            </div>
                                            <div className="pt-6">
                                                <Button type="submit" disabled={processing}>
                                                    <Plus />
                                                    Lägg till
                                                </Button>
                                            </div>
                                        </>
                                    )}
                                </Form>

                                <div className="divide-y rounded-md border">
                                    {rssFeeds.length === 0 && <p className="text-muted-foreground p-4 text-sm">Inga RSS-källor ännu.</p>}
                                    {rssFeeds.map((feed) => (
                                        <div key={feed.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="font-medium">{feed.name}</span>
                                                    {!feed.is_active && <span className="text-destructive text-xs">Inaktiv</span>}
                                                    <span className="text-muted-foreground text-xs">{feed.item_limit} rubriker</span>
                                                </div>
                                                <p className="text-muted-foreground mt-1 truncate text-sm">{feed.url}</p>
                                            </div>
                                            <Form {...destroyRssFeed.form(feed.id)}>
                                                <Button variant="ghost" size="icon" type="submit" aria-label="Ta bort RSS-källa">
                                                    <Trash2 />
                                                </Button>
                                            </Form>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        {canManageModerators && (
                            <Card className="rounded-lg">
                                <CardHeader>
                                    <CardTitle>Moderatorer</CardTitle>
                                    <CardDescription>Owner kan lägga till moderatorer som får hantera ticker, kö och RSS.</CardDescription>
                                </CardHeader>
                                <CardContent className="flex flex-col gap-4">
                                    <Form {...storeModerator.form()} resetOnSuccess className="grid gap-3 md:grid-cols-[1fr_1fr_150px_150px_auto]">
                                        {({ errors, processing }) => (
                                            <>
                                                <div>
                                                    <Label htmlFor="moderator_name">Namn</Label>
                                                    <Input id="moderator_name" name="name" />
                                                    {errors.name && <p className="text-destructive mt-1 text-sm">{errors.name}</p>}
                                                </div>
                                                <div>
                                                    <Label htmlFor="moderator_email">E-post</Label>
                                                    <Input id="moderator_email" name="email" type="email" />
                                                    {errors.email && <p className="text-destructive mt-1 text-sm">{errors.email}</p>}
                                                </div>
                                                <div>
                                                    <Label htmlFor="moderator_password">Lösenord</Label>
                                                    <Input id="moderator_password" name="password" type="password" />
                                                    {errors.password && <p className="text-destructive mt-1 text-sm">{errors.password}</p>}
                                                </div>
                                                <div>
                                                    <Label htmlFor="moderator_password_confirmation">Bekräfta</Label>
                                                    <Input id="moderator_password_confirmation" name="password_confirmation" type="password" />
                                                </div>
                                                <div className="pt-6">
                                                    <Button type="submit" disabled={processing}>
                                                        <Users />
                                                        Lägg till
                                                    </Button>
                                                </div>
                                            </>
                                        )}
                                    </Form>

                                    <div className="divide-y rounded-md border">
                                        {moderators.map((moderator) => (
                                            <div key={moderator.id} className="flex items-center justify-between gap-3 p-4">
                                                <div className="min-w-0">
                                                    <p className="font-medium">{moderator.name}</p>
                                                    <p className="text-muted-foreground truncate text-sm">{moderator.email}</p>
                                                </div>
                                                <span className="text-muted-foreground text-xs uppercase">{moderator.role}</span>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    <Card className="h-fit rounded-lg">
                        <CardHeader>
                            <CardTitle>Utseende</CardTitle>
                            <CardDescription>Kopiera länkarna till OBS och publik inskickssida.</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-5">
                            <div className="flex flex-wrap gap-2">
                                <Button variant="secondary" size="sm" type="button" onClick={() => void copyToClipboard(tickerUrl)}>
                                    <Copy />
                                    Kopiera OBS-länk
                                </Button>
                                <Button variant="secondary" size="sm" type="button" onClick={() => void copyToClipboard(chromaTickerUrl)}>
                                    <Copy />
                                    Kopiera chroma
                                </Button>
                                <Button variant="secondary" size="sm" type="button" onClick={() => void copyToClipboard(submitUrl)}>
                                    <Copy />
                                    Kopiera inskick
                                </Button>
                            </div>
                            <div className="overflow-hidden rounded-lg border bg-neutral-950 p-4">
                                <div
                                    className={[
                                        'grid min-h-16 overflow-hidden shadow-xl',
                                        previewColumns,
                                        settings.shape_style === 'pill' ? 'rounded-full' : 'rounded-md',
                                        settings.shape_style === 'angled' ? '[clip-path:polygon(0_0,97%_0,100%_100%,0_100%)]' : '',
                                    ].join(' ')}
                                    style={{ backgroundColor: settings.background_color, color: settings.text_color }}
                                >
                                    {settings.image_url && (
                                        <div className={`row-start-1 flex items-center justify-center bg-white/10 p-2 ${previewImageColumn}`}>
                                            <img src={settings.image_url} alt="" className="max-h-10 max-w-12 object-contain" />
                                        </div>
                                    )}
                                    <div
                                        className={`row-start-1 flex items-center justify-center px-4 text-sm font-bold uppercase ${previewLabelColumn}`}
                                        style={{ backgroundColor: settings.accent_color, color: settings.background_color }}
                                    >
                                        {playingMessage ? settings.user_headline : settings.rss_headline}
                                    </div>
                                    <div className={`row-start-1 flex min-w-0 items-center px-4 text-sm font-semibold ${previewTextColumn}`}>
                                        <span className="truncate">{playingMessage?.content ?? 'RSS-rubrik visas när kön är tom'}</span>
                                    </div>
                                </div>
                            </div>
                            <Form {...updateSettings.form()} className="flex flex-col gap-4">
                                {({ processing }) => (
                                    <>
                                        <div>
                                            <Label htmlFor="headline">Standardrubrik</Label>
                                            <Input id="headline" name="headline" defaultValue={settings.headline} />
                                        </div>
                                        <div>
                                            <Label htmlFor="rss_headline">RSS-rubrik</Label>
                                            <Input id="rss_headline" name="rss_headline" defaultValue={settings.rss_headline} />
                                        </div>
                                        <div>
                                            <Label htmlFor="user_headline">Användarrubrik</Label>
                                            <Input id="user_headline" name="user_headline" defaultValue={settings.user_headline} />
                                        </div>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div>
                                                <Label htmlFor="background_color">Bakgrund</Label>
                                                <Input id="background_color" name="background_color" type="color" defaultValue={settings.background_color} className="h-10 p-1" />
                                            </div>
                                            <div>
                                                <Label htmlFor="text_color">Text</Label>
                                                <Input id="text_color" name="text_color" type="color" defaultValue={settings.text_color} className="h-10 p-1" />
                                            </div>
                                            <div>
                                                <Label htmlFor="accent_color">Accent</Label>
                                                <Input id="accent_color" name="accent_color" type="color" defaultValue={settings.accent_color} className="h-10 p-1" />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <Label htmlFor="canvas_width">OBS bredd</Label>
                                                <Input id="canvas_width" name="canvas_width" type="number" min="320" max="7680" defaultValue={settings.canvas_width} />
                                            </div>
                                            <div>
                                                <Label htmlFor="canvas_height">OBS höjd</Label>
                                                <Input id="canvas_height" name="canvas_height" type="number" min="180" max="4320" defaultValue={settings.canvas_height} />
                                            </div>
                                        </div>
                                        <div>
                                            <Label htmlFor="animation_style">Animation</Label>
                                            <Select name="animation_style" defaultValue={settings.animation_style}>
                                                <SelectTrigger id="animation_style" className="mt-1 w-full">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="slide-left">Svep in från vänster</SelectItem>
                                                    <SelectItem value="fade">Fade in</SelectItem>
                                                    <SelectItem value="bounce">Bounce</SelectItem>
                                                    <SelectItem value="zoom">Zoom/form</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label htmlFor="animation_duration_seconds">Fade in sekunder</Label>
                                            <Input
                                                id="animation_duration_seconds"
                                                name="animation_duration_seconds"
                                                type="number"
                                                min="1"
                                                max="10"
                                                defaultValue={settings.animation_duration_seconds}
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="animation_out_duration_seconds">Fade ut sekunder</Label>
                                            <Input
                                                id="animation_out_duration_seconds"
                                                name="animation_out_duration_seconds"
                                                type="number"
                                                min="1"
                                                max="10"
                                                defaultValue={settings.animation_out_duration_seconds}
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="shape_style">Form</Label>
                                            <Select name="shape_style" defaultValue={settings.shape_style}>
                                                <SelectTrigger id="shape_style" className="mt-1 w-full">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="bar">Rak lower-third</SelectItem>
                                                    <SelectItem value="pill">Rundad pill</SelectItem>
                                                    <SelectItem value="angled">Sned kant</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label htmlFor="label_position">Rubrikposition</Label>
                                            <Select name="label_position" defaultValue={settings.label_position}>
                                                <SelectTrigger id="label_position" className="mt-1 w-full">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="left">Vänster</SelectItem>
                                                    <SelectItem value="right">Höger</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label htmlFor="chroma_key_color">Chromakey</Label>
                                            <Select name="chroma_key_color" defaultValue={settings.chroma_key_color}>
                                                <SelectTrigger id="chroma_key_color" className="mt-1 w-full">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="green">Grön</SelectItem>
                                                    <SelectItem value="blue">Blå</SelectItem>
                                                    <SelectItem value="magenta">Magenta</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label htmlFor="image_url">Bild URL</Label>
                                            <Input id="image_url" name="image_url" type="url" defaultValue={settings.image_url ?? ''} placeholder="https://.../logo.png" />
                                        </div>
                                        <div>
                                            <Label htmlFor="crawl_duration_seconds">Scrolltid sekunder</Label>
                                            <Input id="crawl_duration_seconds" name="crawl_duration_seconds" type="number" min="10" max="180" defaultValue={settings.crawl_duration_seconds} />
                                        </div>
                                        <div>
                                            <Label htmlFor="message_display_seconds">Visningstid för kötext</Label>
                                            <Input id="message_display_seconds" name="message_display_seconds" type="number" min="5" max="120" defaultValue={settings.message_display_seconds} />
                                        </div>
                                        <div>
                                            <Label htmlFor="poll_interval_seconds">Uppdateringsintervall</Label>
                                            <Input id="poll_interval_seconds" name="poll_interval_seconds" type="number" min="5" max="120" defaultValue={settings.poll_interval_seconds} />
                                        </div>
                                        <label className="flex items-center gap-2 text-sm">
                                            <input type="hidden" name="show_rss" value="0" />
                                            <Checkbox name="show_rss" value="1" defaultChecked={settings.show_rss} />
                                            Visa RSS
                                        </label>
                                        <Button type="submit" disabled={processing}>
                                            <RadioTower />
                                            Spara ticker
                                        </Button>
                                    </>
                                )}
                            </Form>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </>
    );
}

TickerDashboard.layout = {
    breadcrumbs: [
        {
            title: 'Ticker',
            href: tickerDashboard(),
        },
    ],
};
