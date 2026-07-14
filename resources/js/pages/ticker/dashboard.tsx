import { Form, Head } from '@inertiajs/react';
import {
    ChevronDown,
    Copy,
    ExternalLink,
    Plus,
    RadioTower,
    Trash2,
    Users,
} from 'lucide-react';
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useClipboard } from '@/hooks/use-clipboard';
import { useTranslation } from '@/lib/i18n';
import { fitTextToWidth } from '@/lib/text';
import { dashboard as tickerDashboard } from '@/routes/ticker';
import {
    store as storeMessage,
    destroy as destroyMessage,
} from '@/routes/ticker/messages';
import { store as storeModerator } from '@/routes/ticker/moderators';
import {
    store as storeRssFeed,
    destroy as destroyRssFeed,
} from '@/routes/ticker/rss-feeds';
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
    ticker_style: string | null;
    ticker_use_image_style: boolean;
    label_position: 'left' | 'right';
    chroma_key_color: 'green' | 'blue' | 'magenta';
    image_url: string | null;
    crawl_duration_seconds: number;
    message_display_seconds: number;
    poll_interval_seconds: number;
    require_auth_to_submit: boolean;
    moderator_only_submissions: boolean;
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
    tickerStyles: {
        value: string;
        label: string;
        url: string;
    }[];
    tickerUrl: string;
    submitUrl: string;
};

function SettingsSection({
    title,
    description,
    defaultOpen = false,
    children,
}: {
    title: string;
    description: string;
    defaultOpen?: boolean;
    children: ReactNode;
}) {
    return (
        <Collapsible
            defaultOpen={defaultOpen}
            className="rounded-lg border bg-card"
        >
            <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                <span className="min-w-0">
                    <span className="block text-sm font-medium">{title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                        {description}
                    </span>
                </span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="border-t px-4 py-4">
                <div className="grid gap-4">{children}</div>
            </CollapsibleContent>
        </Collapsible>
    );
}

export default function TickerDashboard({
    messages,
    rssFeeds,
    settings,
    moderators,
    canManageModerators,
    tickerStyles,
    tickerUrl,
    submitUrl,
}: Props) {
    const { t } = useTranslation();
    const [, copyToClipboard] = useClipboard();
    const [selectedTickerStyleValue, setSelectedTickerStyleValue] = useState(
        settings.ticker_style ?? '__none',
    );
    // Interactive two-mode picker. Initialized from the saved
    // ticker_style so the picker always lands on the user's actual
    // mode after a page reload — independent after that, so the user
    // can freely switch drafts without losing their saved color or
    // image_url (those are kept alive via hidden DOM inputs so the
    // backend's required-color validator still passes).
    const [skinMode, setSkinMode] = useState<'colors' | 'theme'>(
        selectedTickerStyleValue !== '__none' ? 'theme' : 'colors',
    );
    // Refs to the two radio-group buttons. The WAI-ARIA radio
    // pattern requires exactly one radio to be the tab stop
    // (tabIndex=0) and arrow-key support to move focus + change
    // selection in a single keystroke; the refs let onKeyDown
    // hand focus to the freshly-selected radio after a toggle.
    const modeButtonRefs = useRef<{
        colors: HTMLButtonElement | null;
        theme: HTMLButtonElement | null;
    }>({ colors: null, theme: null });
    const onModeKeyDown = (
        event: React.KeyboardEvent<HTMLButtonElement>,
        nextMode: 'colors' | 'theme',
    ): void => {
        if (
            event.key === 'ArrowLeft' ||
            event.key === 'ArrowRight' ||
            event.key === 'ArrowUp' ||
            event.key === 'ArrowDown'
        ) {
            event.preventDefault();
            setSkinMode(nextMode);
            modeButtonRefs.current[nextMode]?.focus();
        }
    };
    const queuedMessages = messages.filter(
        (message) => message.status === 'queued',
    ).length;
    const playingMessage = messages.find(
        (message) => message.status === 'playing',
    );
    const chromaTickerUrl = `${tickerUrl}${tickerUrl.includes('?') ? '&' : '?'}chroma=1`;
    const selectedTickerStyle = tickerStyles.find(
        (style) => style.value === selectedTickerStyleValue,
    );
    const previewTickerSkinUrl =
        selectedTickerStyle?.url ?? '/images/default-ticker.png';
    const previewLabelIsRight = settings.label_position === 'right';
    const previewHeadline = playingMessage
        ? settings.user_headline
        : settings.rss_headline;
    const previewHeadlineFontSize = fitTextToWidth(
        previewHeadline.toUpperCase(),
        {
            maxSize: 14,
            minSize: 9,
            maxWidth: 138,
            fontWeight: '700',
        },
    );
    // The preview is driven by the picker's LOCAL state — not the
    // persisted DB values — so the dashboard renders what the user
    // is about to save rather than what's currently saved. After a
    // Save the picker re-initializes from settings.ticker_style on
    // the next remount, so the WYSIWYG semantics hold end-to-end.
    //
    // Mirrors show.tsx's shellColumns logic in preview-px units:
    // 1-col when the user picked Theme skin, 2-col when the user
    // picked Colors & Logo with no logo, 3-col when the user picked
    // Colors & Logo with an image URL.
    const previewHasThemeSkin = skinMode === 'theme';
    const previewHasImageSkin =
        skinMode === 'colors' && Boolean(settings.image_url);
    const previewHasVisualSkin = previewHasThemeSkin || previewHasImageSkin;
    const previewImageWidth = previewHasImageSkin ? 64 : 0;
    const previewLabelWidth = 170;
    const previewImageColumn = previewLabelIsRight
        ? 'col-start-3'
        : 'col-start-1';
    const previewLabelColumn = previewLabelIsRight
        ? 'col-start-2'
        : previewHasImageSkin
          ? 'col-start-2'
          : 'col-start-1';
    const previewTextColumn = previewLabelIsRight
        ? 'col-start-1'
        : previewHasImageSkin
          ? 'col-start-3'
          : 'col-start-2';
    const previewShellColumns = previewHasThemeSkin
        ? 'grid-cols-[1fr]'
        : previewLabelIsRight
          ? previewHasImageSkin
              ? `grid-cols-[1fr_${previewLabelWidth}px_${previewImageWidth}px]`
              : `grid-cols-[1fr_${previewLabelWidth}px]`
          : previewHasImageSkin
            ? `grid-cols-[${previewImageWidth}px_${previewLabelWidth}px_1fr]`
            : `grid-cols-[${previewLabelWidth}px_1fr]`;
    const previewMode = previewHasThemeSkin
        ? 'Theme skin'
        : previewHasImageSkin
          ? 'Colors + logo'
          : 'Built-in colors';
    const previewModeDescription = previewHasThemeSkin
        ? 'the selected theme banner with the active headline overlaid'
        : previewHasImageSkin
          ? 'built-in colors with your logo as a left/right column'
          : 'built-in colors and shape (no image or theme selected)';

    return (
        <>
            <Head title="Ticker" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-normal">
                            OBS Ticker
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Lower-third for OBS Browser Source. {queuedMessages}{' '}
                            queued
                            {playingMessage
                                ? `, playing: ${playingMessage.content}`
                                : ', RSS is used when the queue is empty'}
                            .
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" size="sm" asChild>
                            <a
                                href={submitUrl}
                                target="_blank"
                                rel="noreferrer"
                            >
                                <ExternalLink />
                                Submission page
                            </a>
                        </Button>
                    </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="flex flex-col gap-4">
                        <Card className="rounded-lg">
                            <CardHeader>
                                <CardTitle>Manual messages</CardTitle>
                                <CardDescription>
                                    Submit short messages that appear before RSS
                                    headlines.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-4">
                                <Form
                                    {...storeMessage.form()}
                                    resetOnSuccess
                                    className="grid gap-3 md:grid-cols-[1fr_150px_110px_auto]"
                                >
                                    {({ errors, processing }) => (
                                        <>
                                            <div className="md:col-span-4">
                                                <Label htmlFor="content">
                                                    Admin message for queue
                                                </Label>
                                                <textarea
                                                    id="content"
                                                    name="content"
                                                    rows={3}
                                                    className="mt-1 flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                                    placeholder="Write the message that should roll in the lower-third..."
                                                />
                                                {errors.content && (
                                                    <p className="mt-1 text-sm text-destructive">
                                                        {errors.content}
                                                    </p>
                                                )}
                                            </div>
                                            <div>
                                                <Label htmlFor="source_label">
                                                    Label
                                                </Label>
                                                <Input
                                                    id="source_label"
                                                    name="source_label"
                                                    placeholder="Studio"
                                                />
                                            </div>
                                            <div>
                                                <Label htmlFor="sort_order">
                                                    Order
                                                </Label>
                                                <Input
                                                    id="sort_order"
                                                    name="sort_order"
                                                    type="number"
                                                    min="0"
                                                    defaultValue="0"
                                                />
                                            </div>
                                            <label className="flex items-center gap-2 pt-6 text-sm">
                                                <input
                                                    type="hidden"
                                                    name="is_active"
                                                    value="0"
                                                />
                                                <Checkbox
                                                    name="is_active"
                                                    value="1"
                                                    defaultChecked
                                                />
                                                Active
                                            </label>
                                            <div className="pt-6">
                                                <Button
                                                    type="submit"
                                                    disabled={processing}
                                                >
                                                    <Plus />
                                                    Add
                                                </Button>
                                            </div>
                                        </>
                                    )}
                                </Form>

                                <div className="divide-y rounded-md border">
                                    {messages.length === 0 && (
                                        <p className="p-4 text-sm text-muted-foreground">
                                            No messages yet.
                                        </p>
                                    )}
                                    {messages.map((message) => (
                                        <div
                                            key={message.id}
                                            className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center"
                                        >
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-xs text-muted-foreground">
                                                        {message.source_type ===
                                                        'user'
                                                            ? 'User'
                                                            : 'Admin'}
                                                    </span>
                                                    {(message.submitter_name ||
                                                        message.source_label) && (
                                                        <span className="text-xs text-muted-foreground">
                                                            {message.submitter_name ??
                                                                message.source_label}
                                                        </span>
                                                    )}
                                                    <span className="text-xs text-muted-foreground">
                                                        #{message.sort_order}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {message.status ===
                                                        'queued'
                                                            ? 'Queued'
                                                            : message.status ===
                                                                'playing'
                                                              ? 'Playing now'
                                                              : 'Done'}
                                                    </span>
                                                    {!message.is_active && (
                                                        <span className="text-xs text-destructive">
                                                            Inactive
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="mt-1 text-sm">
                                                    {message.content}
                                                </p>
                                            </div>
                                            <Form
                                                {...destroyMessage.form(
                                                    message.id,
                                                )}
                                            >
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    type="submit"
                                                    aria-label="Delete message"
                                                >
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
                                <CardTitle>RSS feeds</CardTitle>
                                <CardDescription>
                                    Headlines are fetched server-side with cache
                                    and mixed in after manual messages.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-4">
                                <Form
                                    {...storeRssFeed.form()}
                                    resetOnSuccess
                                    className="grid gap-3 md:grid-cols-[180px_1fr_120px_140px_auto]"
                                >
                                    {({ errors, processing }) => (
                                        <>
                                            <div>
                                                <Label htmlFor="name">
                                                    Name
                                                </Label>
                                                <Input
                                                    id="name"
                                                    name="name"
                                                    placeholder="SVT"
                                                />
                                                {errors.name && (
                                                    <p className="mt-1 text-sm text-destructive">
                                                        {errors.name}
                                                    </p>
                                                )}
                                            </div>
                                            <div>
                                                <Label htmlFor="url">
                                                    RSS URL
                                                </Label>
                                                <Input
                                                    id="url"
                                                    name="url"
                                                    type="url"
                                                    placeholder="https://..."
                                                />
                                                {errors.url && (
                                                    <p className="mt-1 text-sm text-destructive">
                                                        {errors.url}
                                                    </p>
                                                )}
                                            </div>
                                            <div>
                                                <Label htmlFor="item_limit">
                                                    Items
                                                </Label>
                                                <Input
                                                    id="item_limit"
                                                    name="item_limit"
                                                    type="number"
                                                    min="1"
                                                    max="20"
                                                    defaultValue="5"
                                                />
                                            </div>
                                            <div>
                                                <Label htmlFor="refresh_minutes">
                                                    Cache minutes
                                                </Label>
                                                <Input
                                                    id="refresh_minutes"
                                                    name="refresh_minutes"
                                                    type="number"
                                                    min="5"
                                                    max="180"
                                                    defaultValue="15"
                                                />
                                            </div>
                                            <div className="pt-6">
                                                <Button
                                                    type="submit"
                                                    disabled={processing}
                                                >
                                                    <Plus />
                                                    Add
                                                </Button>
                                            </div>
                                        </>
                                    )}
                                </Form>

                                <div className="divide-y rounded-md border">
                                    {rssFeeds.length === 0 && (
                                        <p className="p-4 text-sm text-muted-foreground">
                                            No RSS feeds yet.
                                        </p>
                                    )}
                                    {rssFeeds.map((feed) => (
                                        <div
                                            key={feed.id}
                                            className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center"
                                        >
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="font-medium">
                                                        {feed.name}
                                                    </span>
                                                    {!feed.is_active && (
                                                        <span className="text-xs text-destructive">
                                                            Inactive
                                                        </span>
                                                    )}
                                                    <span className="text-xs text-muted-foreground">
                                                        {feed.item_limit}{' '}
                                                        headlines
                                                    </span>
                                                </div>
                                                <p className="mt-1 truncate text-sm text-muted-foreground">
                                                    {feed.url}
                                                </p>
                                            </div>
                                            <Form
                                                {...destroyRssFeed.form(
                                                    feed.id,
                                                )}
                                            >
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    type="submit"
                                                    aria-label="Delete RSS feed"
                                                >
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
                                    <CardTitle>Moderators</CardTitle>
                                    <CardDescription>
                                        The owner can add moderators who may
                                        manage the ticker, queue, and RSS feeds.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="flex flex-col gap-4">
                                    <Form
                                        {...storeModerator.form()}
                                        resetOnSuccess
                                        className="grid gap-3 md:grid-cols-[1fr_1fr_150px_150px_auto]"
                                    >
                                        {({ errors, processing }) => (
                                            <>
                                                <div>
                                                    <Label htmlFor="moderator_name">
                                                        Name
                                                    </Label>
                                                    <Input
                                                        id="moderator_name"
                                                        name="name"
                                                    />
                                                    {errors.name && (
                                                        <p className="mt-1 text-sm text-destructive">
                                                            {errors.name}
                                                        </p>
                                                    )}
                                                </div>
                                                <div>
                                                    <Label htmlFor="moderator_email">
                                                        Email
                                                    </Label>
                                                    <Input
                                                        id="moderator_email"
                                                        name="email"
                                                        type="email"
                                                    />
                                                    {errors.email && (
                                                        <p className="mt-1 text-sm text-destructive">
                                                            {errors.email}
                                                        </p>
                                                    )}
                                                </div>
                                                <div>
                                                    <Label htmlFor="moderator_password">
                                                        Password
                                                    </Label>
                                                    <Input
                                                        id="moderator_password"
                                                        name="password"
                                                        type="password"
                                                    />
                                                    {errors.password && (
                                                        <p className="mt-1 text-sm text-destructive">
                                                            {errors.password}
                                                        </p>
                                                    )}
                                                </div>
                                                <div>
                                                    <Label htmlFor="moderator_password_confirmation">
                                                        Confirm
                                                    </Label>
                                                    <Input
                                                        id="moderator_password_confirmation"
                                                        name="password_confirmation"
                                                        type="password"
                                                    />
                                                </div>
                                                <div className="pt-6">
                                                    <Button
                                                        type="submit"
                                                        disabled={processing}
                                                    >
                                                        <Users />
                                                        Add
                                                    </Button>
                                                </div>
                                            </>
                                        )}
                                    </Form>

                                    <div className="divide-y rounded-md border">
                                        {moderators.map((moderator) => (
                                            <div
                                                key={moderator.id}
                                                className="flex items-center justify-between gap-3 p-4"
                                            >
                                                <div className="min-w-0">
                                                    <p className="font-medium">
                                                        {moderator.name}
                                                    </p>
                                                    <p className="truncate text-sm text-muted-foreground">
                                                        {moderator.email}
                                                    </p>
                                                </div>
                                                <span className="text-xs text-muted-foreground uppercase">
                                                    {moderator.role}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    <Card className="h-fit rounded-lg">
                        <CardHeader>
                            <CardTitle>Appearance</CardTitle>
                            <CardDescription>
                                Copy the links for OBS and the public submission
                                page.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-5">
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    type="button"
                                    onClick={() =>
                                        void copyToClipboard(tickerUrl)
                                    }
                                >
                                    <Copy />
                                    Copy OBS link
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    type="button"
                                    onClick={() =>
                                        void copyToClipboard(chromaTickerUrl)
                                    }
                                >
                                    <Copy />
                                    Copy chroma link
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    type="button"
                                    onClick={() =>
                                        void copyToClipboard(submitUrl)
                                    }
                                >
                                    <Copy />
                                    Copy submission link
                                </Button>
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-medium">
                                            Preview
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            Same column layout as the OBS
                                            Browser Source: shows{' '}
                                            {previewModeDescription}, plus the
                                            current message content.
                                        </p>
                                    </div>
                                    <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                                        Skin: {previewMode}
                                    </span>
                                </div>
                                <div className="overflow-hidden rounded-lg border bg-neutral-950 p-4">
                                    <div
                                        className={[
                                            'relative grid min-h-16 overflow-hidden shadow-xl',
                                            previewShellColumns,
                                            settings.shape_style === 'pill'
                                                ? 'rounded-full'
                                                : 'rounded-md',
                                            settings.shape_style === 'angled'
                                                ? '[clip-path:polygon(0_0,97%_0,100%_100%,0_100%)]'
                                                : '',
                                        ].join(' ')}
                                        style={{
                                            backgroundColor:
                                                previewHasVisualSkin
                                                    ? 'transparent'
                                                    : settings.background_color,
                                            // Only the theme-skin mode
                                            // uses a background-image on
                                            // the shell; in image/logo
                                            // mode the image goes into a
                                            // dedicated grid column to
                                            // mirror show.tsx exactly.
                                            backgroundImage: previewHasThemeSkin
                                                ? `url("${previewTickerSkinUrl}")`
                                                : undefined,
                                            backgroundPosition: 'center 52%',
                                            backgroundRepeat: 'no-repeat',
                                            backgroundSize: '100% auto',
                                            color: settings.text_color,
                                        }}
                                    >
                                        {previewHasImageSkin && (
                                            <div
                                                className={`relative z-10 row-start-1 flex items-center justify-center bg-white/10 ${previewImageColumn}`}
                                            >
                                                <img
                                                    src={
                                                        settings.image_url ?? ''
                                                    }
                                                    alt=""
                                                    className="max-h-10 max-w-14 object-contain"
                                                />
                                            </div>
                                        )}
                                        <div
                                            className={`relative z-10 row-start-1 flex min-w-0 items-center justify-center overflow-hidden px-4 text-sm font-bold uppercase ${previewLabelColumn}`}
                                            style={{
                                                backgroundColor:
                                                    previewHasThemeSkin
                                                        ? 'transparent'
                                                        : settings.accent_color,
                                                color: previewHasThemeSkin
                                                    ? '#ffffff'
                                                    : settings.background_color,
                                                textShadow: previewHasThemeSkin
                                                    ? '0 1px 8px rgb(0 0 0 / 0.45)'
                                                    : undefined,
                                                fontSize: `${previewHeadlineFontSize}px`,
                                            }}
                                        >
                                            <span className="truncate">
                                                {previewHeadline}
                                            </span>
                                        </div>
                                        <div
                                            className={`relative z-0 row-start-1 flex min-w-0 items-center overflow-hidden px-4 text-sm font-semibold ${previewTextColumn}`}
                                        >
                                            <span className="truncate">
                                                {playingMessage?.content ??
                                                    'RSS headline shown when the queue is empty'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <Form
                                {...updateSettings.form()}
                                className="flex flex-col gap-4"
                            >
                                {({ processing }) => (
                                    <>
                                        <div className="rounded-lg border bg-card">
                                            <div className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                                                <span className="min-w-0">
                                                    <span className="block text-sm font-medium">
                                                        Skin mode
                                                    </span>
                                                    <span className="mt-0.5 block text-xs text-muted-foreground">
                                                        Pick how the lower-third
                                                        is visually styled.
                                                        Switching modes
                                                        preserves your existing
                                                        colors and image URL.
                                                    </span>
                                                </span>
                                            </div>
                                            <div className="border-t px-4 py-4">
                                                <div
                                                    role="radiogroup"
                                                    aria-label="Skin mode"
                                                    className="inline-flex w-full rounded-md border bg-muted p-1"
                                                >
                                                    <button
                                                        type="button"
                                                        role="radio"
                                                        ref={(el) => {
                                                            modeButtonRefs.current.colors =
                                                                el;
                                                        }}
                                                        aria-checked={
                                                            skinMode ===
                                                            'colors'
                                                        }
                                                        tabIndex={
                                                            skinMode ===
                                                            'colors'
                                                                ? 0
                                                                : -1
                                                        }
                                                        onClick={() =>
                                                            setSkinMode(
                                                                'colors',
                                                            )
                                                        }
                                                        onKeyDown={(event) =>
                                                            onModeKeyDown(
                                                                event,
                                                                'colors',
                                                            )
                                                        }
                                                        className={[
                                                            'flex-1 rounded-sm px-3 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring',
                                                            skinMode ===
                                                            'colors'
                                                                ? 'bg-background text-foreground shadow-sm'
                                                                : 'text-muted-foreground hover:text-foreground',
                                                        ].join(' ')}
                                                    >
                                                        Colors &amp; Logo
                                                    </button>
                                                    <button
                                                        type="button"
                                                        role="radio"
                                                        ref={(el) => {
                                                            modeButtonRefs.current.theme =
                                                                el;
                                                        }}
                                                        aria-checked={
                                                            skinMode === 'theme'
                                                        }
                                                        tabIndex={
                                                            skinMode === 'theme'
                                                                ? 0
                                                                : -1
                                                        }
                                                        onClick={() =>
                                                            setSkinMode('theme')
                                                        }
                                                        onKeyDown={(event) =>
                                                            onModeKeyDown(
                                                                event,
                                                                'theme',
                                                            )
                                                        }
                                                        className={[
                                                            'flex-1 rounded-sm px-3 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring',
                                                            skinMode === 'theme'
                                                                ? 'bg-background text-foreground shadow-sm'
                                                                : 'text-muted-foreground hover:text-foreground',
                                                        ].join(' ')}
                                                    >
                                                        Theme skin
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {skinMode === 'colors' && (
                                            <input
                                                type="hidden"
                                                name="ticker_style"
                                                value="__none"
                                            />
                                        )}
                                        {skinMode === 'theme' && (
                                            <div className="hidden">
                                                <input
                                                    type="hidden"
                                                    name="background_color"
                                                    value={
                                                        settings.background_color
                                                    }
                                                />
                                                <input
                                                    type="hidden"
                                                    name="text_color"
                                                    value={settings.text_color}
                                                />
                                                <input
                                                    type="hidden"
                                                    name="accent_color"
                                                    value={
                                                        settings.accent_color
                                                    }
                                                />
                                                <input
                                                    type="hidden"
                                                    name="image_url"
                                                    value={
                                                        settings.image_url ?? ''
                                                    }
                                                />
                                            </div>
                                        )}

                                        {skinMode === 'colors' ? (
                                            <SettingsSection
                                                title="Colors and logo"
                                                description="Three colors plus an optional logo URL. Logo is rendered as a left/right column inside the lower-third."
                                                defaultOpen
                                            >
                                                <div className="grid grid-cols-3 gap-3">
                                                    <div>
                                                        <Label htmlFor="background_color">
                                                            Background
                                                        </Label>
                                                        <Input
                                                            id="background_color"
                                                            name="background_color"
                                                            type="color"
                                                            defaultValue={
                                                                settings.background_color
                                                            }
                                                            className="h-10 p-1"
                                                        />
                                                    </div>
                                                    <div>
                                                        <Label htmlFor="text_color">
                                                            Text
                                                        </Label>
                                                        <Input
                                                            id="text_color"
                                                            name="text_color"
                                                            type="color"
                                                            defaultValue={
                                                                settings.text_color
                                                            }
                                                            className="h-10 p-1"
                                                        />
                                                    </div>
                                                    <div>
                                                        <Label htmlFor="accent_color">
                                                            Accent
                                                        </Label>
                                                        <Input
                                                            id="accent_color"
                                                            name="accent_color"
                                                            type="color"
                                                            defaultValue={
                                                                settings.accent_color
                                                            }
                                                            className="h-10 p-1"
                                                        />
                                                    </div>
                                                </div>
                                                <div>
                                                    <Label htmlFor="image_url">
                                                        Logo image URL
                                                    </Label>
                                                    <Input
                                                        id="image_url"
                                                        name="image_url"
                                                        type="url"
                                                        defaultValue={
                                                            settings.image_url ??
                                                            ''
                                                        }
                                                        placeholder="https://.../logo.png"
                                                    />
                                                    <p className="mt-1 text-xs text-muted-foreground">
                                                        Optional. Leave empty to
                                                        rely on the three colors
                                                        only. The URL is
                                                        preserved across toggles
                                                        to Theme skin.
                                                    </p>
                                                </div>
                                            </SettingsSection>
                                        ) : (
                                            <SettingsSection
                                                title={t('tickerTheme')}
                                                description="Select a reusable theme skin. Colors and logo are hidden but kept in the form payload so switching back restores them."
                                                defaultOpen
                                            >
                                                <div>
                                                    <Label htmlFor="ticker_style">
                                                        {t('tickerTheme')}
                                                    </Label>
                                                    <Select
                                                        name="ticker_style"
                                                        value={
                                                            selectedTickerStyleValue
                                                        }
                                                        onValueChange={
                                                            setSelectedTickerStyleValue
                                                        }
                                                    >
                                                        <SelectTrigger
                                                            id="ticker_style"
                                                            className="mt-1 w-full"
                                                        >
                                                            <span className="truncate">
                                                                {selectedTickerStyleValue ===
                                                                '__none'
                                                                    ? t('none')
                                                                    : selectedTickerStyle?.label}
                                                            </span>
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="__none">
                                                                {t('none')}
                                                            </SelectItem>
                                                            {tickerStyles.map(
                                                                (style) => (
                                                                    <SelectItem
                                                                        key={
                                                                            style.value
                                                                        }
                                                                        value={
                                                                            style.value
                                                                        }
                                                                    >
                                                                        {
                                                                            style.label
                                                                        }
                                                                    </SelectItem>
                                                                ),
                                                            )}
                                                        </SelectContent>
                                                    </Select>
                                                    <p className="mt-1 text-xs text-muted-foreground">
                                                        Add theme folders with a
                                                        matching JSON file to
                                                        public/ticker-styles to
                                                        make them appear here.
                                                    </p>
                                                </div>
                                            </SettingsSection>
                                        )}

                                        <SettingsSection
                                            title="Headlines"
                                            description="Headlines shown for default, RSS, and submitted messages."
                                            defaultOpen
                                        >
                                            <div>
                                                <Label htmlFor="headline">
                                                    Default headline
                                                </Label>
                                                <Input
                                                    id="headline"
                                                    name="headline"
                                                    defaultValue={
                                                        settings.headline
                                                    }
                                                />
                                            </div>
                                            <div>
                                                <Label htmlFor="rss_headline">
                                                    RSS headline
                                                </Label>
                                                <Input
                                                    id="rss_headline"
                                                    name="rss_headline"
                                                    defaultValue={
                                                        settings.rss_headline
                                                    }
                                                />
                                            </div>
                                            <div>
                                                <Label htmlFor="user_headline">
                                                    User headline
                                                </Label>
                                                <Input
                                                    id="user_headline"
                                                    name="user_headline"
                                                    defaultValue={
                                                        settings.user_headline
                                                    }
                                                />
                                            </div>
                                        </SettingsSection>
                                        <SettingsSection
                                            title="Canvas and display"
                                            description="Canvas size, headline position, chroma key, shape, and entry animation. Shape applies to the lower-third shell regardless of which skin is active."
                                        >
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <Label htmlFor="canvas_width">
                                                        OBS width
                                                    </Label>
                                                    <Input
                                                        id="canvas_width"
                                                        name="canvas_width"
                                                        type="number"
                                                        min="320"
                                                        max="7680"
                                                        defaultValue={
                                                            settings.canvas_width
                                                        }
                                                    />
                                                </div>
                                                <div>
                                                    <Label htmlFor="canvas_height">
                                                        OBS height
                                                    </Label>
                                                    <Input
                                                        id="canvas_height"
                                                        name="canvas_height"
                                                        type="number"
                                                        min="180"
                                                        max="4320"
                                                        defaultValue={
                                                            settings.canvas_height
                                                        }
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <Label htmlFor="animation_style">
                                                    Animation
                                                </Label>
                                                <Select
                                                    name="animation_style"
                                                    defaultValue={
                                                        settings.animation_style
                                                    }
                                                >
                                                    <SelectTrigger
                                                        id="animation_style"
                                                        className="mt-1 w-full"
                                                    >
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="slide-left">
                                                            Slide in from left
                                                        </SelectItem>
                                                        <SelectItem value="fade">
                                                            Fade in
                                                        </SelectItem>
                                                        <SelectItem value="bounce">
                                                            Bounce
                                                        </SelectItem>
                                                        <SelectItem value="zoom">
                                                            Zoom / shape
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div>
                                                <Label htmlFor="animation_duration_seconds">
                                                    Fade in seconds
                                                </Label>
                                                <Input
                                                    id="animation_duration_seconds"
                                                    name="animation_duration_seconds"
                                                    type="number"
                                                    min="1"
                                                    max="10"
                                                    defaultValue={
                                                        settings.animation_duration_seconds
                                                    }
                                                />
                                            </div>
                                            <div>
                                                <Label htmlFor="animation_out_duration_seconds">
                                                    Fade out seconds
                                                </Label>
                                                <Input
                                                    id="animation_out_duration_seconds"
                                                    name="animation_out_duration_seconds"
                                                    type="number"
                                                    min="1"
                                                    max="10"
                                                    defaultValue={
                                                        settings.animation_out_duration_seconds
                                                    }
                                                />
                                            </div>
                                            <div>
                                                <Label htmlFor="shape_style">
                                                    Shape
                                                </Label>
                                                <Select
                                                    name="shape_style"
                                                    defaultValue={
                                                        settings.shape_style
                                                    }
                                                >
                                                    <SelectTrigger
                                                        id="shape_style"
                                                        className="mt-1 w-full"
                                                    >
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="bar">
                                                            Straight lower-third
                                                        </SelectItem>
                                                        <SelectItem value="pill">
                                                            Rounded pill
                                                        </SelectItem>
                                                        <SelectItem value="angled">
                                                            Angled edge
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div>
                                                <Label htmlFor="label_position">
                                                    Headline position
                                                </Label>
                                                <Select
                                                    name="label_position"
                                                    defaultValue={
                                                        settings.label_position
                                                    }
                                                >
                                                    <SelectTrigger
                                                        id="label_position"
                                                        className="mt-1 w-full"
                                                    >
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="left">
                                                            Left
                                                        </SelectItem>
                                                        <SelectItem value="right">
                                                            Right
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div>
                                                <Label htmlFor="chroma_key_color">
                                                    Chroma key
                                                </Label>
                                                <Select
                                                    name="chroma_key_color"
                                                    defaultValue={
                                                        settings.chroma_key_color
                                                    }
                                                >
                                                    <SelectTrigger
                                                        id="chroma_key_color"
                                                        className="mt-1 w-full"
                                                    >
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="green">
                                                            Green
                                                        </SelectItem>
                                                        <SelectItem value="blue">
                                                            Blue
                                                        </SelectItem>
                                                        <SelectItem value="magenta">
                                                            Magenta
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </SettingsSection>
                                        <SettingsSection
                                            title="Timing"
                                            description="How long messages and RSS text stay visible or scroll."
                                        >
                                            <div>
                                                <Label htmlFor="crawl_duration_seconds">
                                                    Scroll duration seconds
                                                </Label>
                                                <Input
                                                    id="crawl_duration_seconds"
                                                    name="crawl_duration_seconds"
                                                    type="number"
                                                    min="10"
                                                    max="180"
                                                    defaultValue={
                                                        settings.crawl_duration_seconds
                                                    }
                                                />
                                            </div>
                                            <div>
                                                <Label htmlFor="message_display_seconds">
                                                    Message display seconds
                                                </Label>
                                                <Input
                                                    id="message_display_seconds"
                                                    name="message_display_seconds"
                                                    type="number"
                                                    min="5"
                                                    max="120"
                                                    defaultValue={
                                                        settings.message_display_seconds
                                                    }
                                                />
                                            </div>
                                            <div>
                                                <Label htmlFor="poll_interval_seconds">
                                                    Refresh interval
                                                </Label>
                                                <Input
                                                    id="poll_interval_seconds"
                                                    name="poll_interval_seconds"
                                                    type="number"
                                                    min="5"
                                                    max="120"
                                                    defaultValue={
                                                        settings.poll_interval_seconds
                                                    }
                                                />
                                            </div>
                                        </SettingsSection>
                                        <SettingsSection
                                            title="Submission and RSS"
                                            description="Control who may submit and whether RSS should fill empty queue time."
                                        >
                                            <label className="flex items-center gap-2 text-sm">
                                                <input
                                                    type="hidden"
                                                    name="require_auth_to_submit"
                                                    value="0"
                                                />
                                                <Checkbox
                                                    name="require_auth_to_submit"
                                                    value="1"
                                                    defaultChecked={
                                                        settings.require_auth_to_submit
                                                    }
                                                />
                                                Require Twitch login to submit
                                            </label>
                                            <label className="flex items-center gap-2 text-sm">
                                                <input
                                                    type="hidden"
                                                    name="moderator_only_submissions"
                                                    value="0"
                                                />
                                                <Checkbox
                                                    name="moderator_only_submissions"
                                                    value="1"
                                                    defaultChecked={
                                                        settings.moderator_only_submissions
                                                    }
                                                />
                                                Moderator-only submissions
                                            </label>
                                            <label className="flex items-center gap-2 text-sm">
                                                <input
                                                    type="hidden"
                                                    name="show_rss"
                                                    value="0"
                                                />
                                                <Checkbox
                                                    name="show_rss"
                                                    value="1"
                                                    defaultChecked={
                                                        settings.show_rss
                                                    }
                                                />
                                                Show RSS
                                            </label>
                                        </SettingsSection>
                                        <Button
                                            type="submit"
                                            disabled={processing}
                                        >
                                            <RadioTower />
                                            Save ticker
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
