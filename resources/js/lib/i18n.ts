import { usePage } from '@inertiajs/react';
import type { Auth } from '@/types';

export type Locale = Auth['user']['locale'];

const messages = {
    en: {
        activeRss: 'Active RSS',
        activeRssDescription: 'Feeds that fill an empty queue',
        admin: 'Admin',
        appearance: 'Appearance',
        createTheme: 'Create theme',
        createThemeDescription:
            'Build a theme from three images, a JSON file, and an author name.',
        createThemeSingleImageDescription:
            'Build a theme from one full-canvas PNG. Drag the dividers to split it into title, content and end before committing.',
        themes: 'Themes',
        themesDescription:
            'Browse existing themes, delete them, or import a zip archive.',
        createThemeTutorial: 'How it works',
        createThemeTutorialDescription:
            'Put three image files and one JSON file in a folder under public/ticker-styles.',
        createThemeTutorialStep1:
            '1. Create a folder named after the theme, for example public/ticker-styles/scoreboard-dark.',
        createThemeTutorialStep2:
            '2. Add title.png, content.png, and end.png inside that folder.',
        createThemeTutorialStep3:
            '3. Add a JSON file with the same name as the folder, for example scoreboard-dark.json.',
        createThemeTutorialStep4:
            '4. Enter the author name in the form so the JSON metadata can be written.',
        createThemeTutorialStep5:
            '5. The generated JSON will include Theme_name, Author, and Created_at.',
        createThemeTutorialStep6:
            '6. Save the theme name in the form and click Slice & apply theme.',
        createThemeTutorialNote:
            'The theme will appear in Ticker theme when the JSON filename and Theme_name match.',
        officialThemesCatalog: 'Official themes catalog',
        officialThemesCatalogDescription:
            'Browse the shared catalog and download official themes.',
        openOfficialThemesCatalog: 'Browse official themes',
        submitTheme: 'Submit theme',
        submitToOfficialThemes: 'Submit to Official themes',
        submitThemeDescription:
            'Send a theme to the official queue for review before it appears in the catalog.',
        submitThemeFormDescription:
            'Upload a zip file or point to a public URL. The theme will stay hidden until approved.',
        themeSubmissionReceived: 'Theme submitted',
        themeSubmissionReceivedDescription:
            'Your submission is now in the official review queue and will appear after approval.',
        deniedReason: 'Denial reason',
        pendingSubmission: 'Submission is pending review',
        pendingSubmissionDescription:
            'The submission is queued and will appear in the catalog once it is approved.',
        submitThemeZip: 'Theme zip',
        submitThemeUrl: 'Theme zip URL',
        submitThemeSubmitterName: 'Your name',
        submitThemeSubmitterEmail: 'Your email',
        submitThemeNotes: 'Notes',
        submitThemeNotesPlaceholder: 'Optional details for the reviewer.',
        themeSubmissions: 'Theme submissions',
        themeSubmissionsDescription:
            'Moderate incoming theme submissions before they are published.',
        pending: 'Pending',
        approved: 'Approved',
        denied: 'Denied',
        rejected: 'Rejected',
        approveSubmission: 'Approve',
        rejectSubmission: 'Reject',
        deleteSubmission: 'Delete',
        source: 'Source',
        noSubmissionsPending: 'No submissions are waiting for review.',
        noPermissionToModerateThemes:
            'You do not have permission to moderate themes.',
        officialThemesOnly:
            'Theme submissions are available only on the official catalog site.',
        rejectionReasonPrompt: 'Rejection reason (optional)',
        deleteThemeSubmissionConfirm:
            'Delete this theme submission? This cannot be undone.',
        submittedAt: 'Submitted at',
        done: 'Done',
        latestMessages: 'Latest messages',
        latestMessagesDescription:
            'Recent submissions and admin messages in the ticker feed.',
        language: 'Language',
        languageDescription: 'Choose the language used in the admin interface.',
        languageSettings: 'Language settings',
        languageSettingsDescription: 'Choose your preferred admin language.',
        logOut: 'Log out',
        messagesHavePlayed: 'messages have played',
        moderators: 'Moderators',
        noMessagesYet: 'No messages yet.',
        none: 'None',
        moderation: 'Moderation',
        overview: 'Overview',
        overviewDescription: 'Queue, RSS, and moderator activity at a glance.',
        playing: 'Playing',
        playingNow: 'playing now',
        profile: 'Profile',
        platform: 'Platform',
        queued: 'Queued',
        ticker: 'Ticker',
        tickerTheme: 'Ticker theme',
        save: 'Save',
        security: 'Security',
        settings: 'Settings',
        settingsDescription: 'Manage your profile and account settings',
        submissionPage: 'Submission page',
        themeName: 'Theme name',
        authorName: 'Author name',
        labelLeft: 'Label left',
        labelWidth: 'Label width',
        viewportLeft: 'Viewport left',
        viewportRight: 'Viewport right',
        titleImage: 'Title image',
        contentImage: 'Content image',
        endImage: 'End image',
        sectionTitle: 'Title',
        sectionContent: 'Content',
        sectionEnd: 'End',
        sourceImage: 'Source image',
        sourceImageDescription:
            'Upload your full ticker design as a single PNG, JPEG, or JPG. The dividers below cut it into the title, content and end slots.',
        sliceAndApplyTheme: 'Slice & apply theme',
        committingTheme: 'Creating theme…',
        commitHint: 'Saves the theme and activates it on the live ticker.',
        cutPositionsLabel:
            'Cuts at {split1}% and {split2}% — drag, or use the arrow keys with focus on a cut.',
        previewTheme: 'Generate preview',
        previewPending: 'Rendering preview…',
        previewReady: 'Preview ready',
        previewFailed: 'Could not render the preview.',
        // Banner title for the top-of-page Alert that surfaces
        // Inertia's `errors` prop on a failed "/stitch" commit.
        // Previously the only error UI was an inline InputError under
        // the theme metadata card — easy to miss on a tall viewport.
        themeSaveErrorTitle: 'Theme could not be saved.',
        previewEmptyState:
            'Upload a source image above to render a preview of the compiled theme.',
        themePreviewSingleImageDescription:
            'The compiled ticker background after the cuts are applied. This is the file OBS will load.',
        themeMetadata: 'Theme details',
        themeMetadataDescription:
            'Name and author recorded in the theme metadata file.',
        themeOverrides: 'Geometry overrides',
        themeOverridesDescription:
            'Optional percentages that override the values derived from the cuts. Leave empty to use the auto-computed values.',
        metricsLabelLeft: 'Label left',
        metricsLabelWidth: 'Label width',
        metricsViewportLeft: 'Viewport left',
        metricsViewportRight: 'Viewport right',
        cutKeyboardHint: 'Use ← and → to nudge (hold Shift for 5% steps).',
        uploadThemeZip: 'Upload theme zip',
        themeZip: 'Theme zip',
        themeZipDescription:
            'Upload a zip that contains title.png, content.png, end.png, and the matching JSON file.',
        themeZipTooLarge: 'File is too large. Maximum size is 10 MB.',
        deleteTheme: 'Delete theme',
        importTheme: 'Import theme',
        addATheme: 'Add a theme',
        orSeparator: 'or',
        themeImportDescription:
            'Import a theme from a shared URL or upload a zip file.',
        themeImportUrl: 'Theme zip URL',
        importThemeFromUrl: 'Import from URL',
        shareThemeUrl: 'Share URL',
        shareThemeUrlDescription:
            'Generate a public zip URL you can send to someone else.',
        generateShareThemeUrl: 'Generate share URL',
        downloadThemeZip: 'Download zip',
        downloadThemeZipDescription: 'Download the theme as a zip archive.',
        shareUrlDialogTitle: 'Generating share URL',
        shareUrlDialogDescription:
            'A public zip is being prepared for this theme.',
        shareUrlProgressInitializing: 'Initializing',
        shareUrlProgressCompressingTheme: 'Compressing theme',
        shareUrlProgressGeneratingArchive: 'Generating compressed archive',
        shareUrlProgressGeneratingUrl: 'Generating URL',
        shareUrlPending: 'No share URL yet',
        shareUrlPendingDescription:
            'Generate a share URL to create a public zip file.',
        shareUrlReady: 'Share URL ready',
        shareUrlError: 'Unable to generate a share URL.',
        copyLink: 'Copy link',
        createdBy: 'Created by',
        themeListEmpty: 'No themes found yet.',
        shareTheme: 'Share theme',
        importThemeNow: 'Import theme',
        previous: 'Previous',
        next: 'Next',
        copy: 'Copy',
        themePreview: 'Theme preview',
        themePreviewDescription:
            'Preview the compiled theme and confirm the generated files.',
        backToThemes: 'Back to themes',
        createAnotherTheme: 'Create another theme',
        todaysSubmissions: "Today's submissions",
        todaysSubmissionsDescription: 'Public audience messages',
        user: 'User',
        bboxTitle: 'Crop region',
        bboxTitleDescription:
            'Drag the four vertical and two horizontal handles to ring in the part of the source image that should feed into the ticker. The dark bands are cropped away before the title/content/end cuts run.',
        bboxKeyboardHintV:
            'Use ← and → to nudge the side handles (hold Shift for 5% steps).',
        bboxKeyboardHintH:
            'Use ↑ and ↓ to nudge the top/bottom handles (hold Shift for 5% steps).',
        bboxPositionsLabel:
            'Crop box: {top}%–{bottom}% vertical, {left}%–{right}% horizontal.',
        bboxBandTop: 'Cropping {pct}% off the top',
        bboxBandBottom: 'Cropping {pct}% off the bottom',
        bboxBandLeft: 'Cropping {pct}% off the left',
        bboxBandRight: 'Cropping {pct}% off the right',
        bboxReset: 'Reset crop box',
        // Manual label-box reset (theme-builder preview row only).
        // The right-column "Label region" card was scoped out to
        // match the minimal spec — keep this key minimal too.
        labelReset: 'Reset label box',
    },
    sv: {
        activeRss: 'Aktiva RSS',
        activeRssDescription: 'Källor som kan fylla tom kö',
        admin: 'Admin',
        appearance: 'Utseende',
        createTheme: 'Skapa tema',
        createThemeDescription:
            'Bygg ett tema av tre bilder, en JSON-fil och ett namn på skaparen.',
        createThemeSingleImageDescription:
            'Bygg ett tema från en hel PNG-design. Dra delarna för att dela in i titel, innehåll och slut innan du sparar.',
        themes: 'Teman',
        themesDescription:
            'Bläddra bland befintliga teman, ta bort dem eller importera en zip-fil.',
        createThemeTutorial: 'Så fungerar det',
        createThemeTutorialDescription:
            'Lägg tre bildfiler och en JSON-fil i en mapp under public/ticker-styles.',
        createThemeTutorialStep1:
            '1. Skapa en mapp med temats namn, till exempel public/ticker-styles/scoreboard-dark.',
        createThemeTutorialStep2:
            '2. Lägg in title.png, content.png och end.png i den mappen.',
        createThemeTutorialStep3:
            '3. Lägg in en JSON-fil med samma namn som mappen, till exempel scoreboard-dark.json.',
        createThemeTutorialStep4:
            '4. Skriv in skaparnamnet i formuläret så JSON-metadatan kan skrivas.',
        createThemeTutorialStep5:
            '5. Den genererade JSON-filen kommer innehålla Theme_name, Author och Created_at.',
        createThemeTutorialStep6:
            '6. Skriv in temats namn i formuläret och klicka Skär och använd tema.',
        createThemeTutorialNote:
            'Temat visas i Ticker theme när JSON-filens namn och Theme_name matchar.',
        officialThemesCatalog: 'Officiell temasamling',
        officialThemesCatalogDescription:
            'Bläddra i den delade samlingen och ladda ner officiella teman.',
        openOfficialThemesCatalog: 'Bläddra i officiella teman',
        submitTheme: 'Skicka in tema',
        submitToOfficialThemes: 'Skicka till officiella teman',
        submitThemeDescription:
            'Skicka ett tema till den officiella kön för granskning innan det syns i katalogen.',
        submitThemeFormDescription:
            'Ladda upp en zip-fil eller ange en publik URL. Temat blir dolt tills det godkänns.',
        themeSubmissionReceived: 'Temat är inskickat',
        themeSubmissionReceivedDescription:
            'Ditt inskick ligger nu i den officiella granskningskön och visas efter godkännande.',
        deniedReason: 'Orsak till avslag',
        pendingSubmission: 'Inskicket väntar på granskning',
        pendingSubmissionDescription:
            'Inskicket ligger i kön och visas i katalogen efter godkännande.',
        submitThemeZip: 'Zip-tema',
        submitThemeUrl: 'URL till zip-tema',
        submitThemeSubmitterName: 'Ditt namn',
        submitThemeSubmitterEmail: 'Din e-post',
        submitThemeNotes: 'Anteckningar',
        submitThemeNotesPlaceholder: 'Valfria detaljer för granskaren.',
        themeSubmissions: 'Temainskick',
        themeSubmissionsDescription:
            'Granska inkommande temainskick innan de publiceras.',
        pending: 'Väntar',
        approved: 'Godkänd',
        denied: 'Nekad',
        rejected: 'Avslagen',
        approveSubmission: 'Godkänn',
        rejectSubmission: 'Avslå',
        deleteSubmission: 'Ta bort',
        source: 'Källa',
        noSubmissionsPending: 'Inga inskick väntar på granskning.',
        noPermissionToModerateThemes:
            'Du har inte behörighet att granska teman.',
        officialThemesOnly:
            'Temainskick finns bara på den officiella katalogsidan.',
        rejectionReasonPrompt: 'Orsak till avslag (valfritt)',
        deleteThemeSubmissionConfirm:
            'Ta bort detta temainskick? Det går inte att ångra.',
        submittedAt: 'Skickad',
        done: 'Klar',
        latestMessages: 'Senaste texter',
        latestMessagesDescription:
            'De senaste inskicken och admintexterna i tickerflödet.',
        language: 'Språk',
        languageDescription: 'Välj språk för administrationsgränssnittet.',
        languageSettings: 'Språkinställningar',
        languageSettingsDescription: 'Välj önskat språk för admin.',
        logOut: 'Logga ut',
        messagesHavePlayed: 'texter har spelats',
        moderators: 'Moderatorer',
        noMessagesYet: 'Inga texter ännu.',
        none: 'Ingen',
        moderation: 'Moderering',
        overview: 'Överblick',
        overviewDescription: 'Överblick över kö, RSS och moderatorer.',
        playing: 'Spelas',
        playingNow: 'spelas just nu',
        profile: 'Profil',
        platform: 'Plattform',
        queued: 'I kö',
        ticker: 'Ticker',
        tickerTheme: 'Ticker tema',
        save: 'Spara',
        security: 'Säkerhet',
        settings: 'Inställningar',
        settingsDescription: 'Hantera profil- och kontoinställningar',
        submissionPage: 'Inskickssida',
        themeName: 'Temanamn',
        authorName: 'Författarnamn',
        labelLeft: 'Etikett vänster',
        labelWidth: 'Etikettbredd',
        viewportLeft: 'Viewport vänster',
        viewportRight: 'Viewport höger',
        titleImage: 'Titelbild',
        contentImage: 'Innehållsbild',
        endImage: 'Slutbild',
        sectionTitle: 'Titel',
        sectionContent: 'Innehåll',
        sectionEnd: 'Slut',
        sourceImage: 'Källbild',
        sourceImageDescription:
            'Ladda upp din fullständiga ticker-design som en PNG, JPEG eller JPG. Delarna nedan skär den i titel-, innehålls- och slut-sektionerna.',
        sliceAndApplyTheme: 'Skär och använd tema',
        committingTheme: 'Skapar tema…',
        commitHint: 'Sparar temat och aktiverar det på den aktiva tickern.',
        cutPositionsLabel:
            'Klipp vid {split1}% och {split2}% — dra, eller använd piltangenterna när ett klipp är fokuserat.',
        previewTheme: 'Skapa förhandsvisning',
        previewPending: 'Skapar förhandsvisning…',
        previewReady: 'Förhandsvisning klar',
        previewFailed: 'Kunde inte skapa förhandsvisningen.',
        // Banner title for the top-of-page Alert that surfaces
        // Inertia's `errors` prop on a failed "/stitch" commit.
        // Previously the only error UI was an inline InputError under
        // the theme metadata card — easy to miss on a tall viewport.
        themeSaveErrorTitle: 'Temat kunde inte sparas.',
        previewEmptyState:
            'Ladda upp en källbild ovan för att skapa en förhandsvisning av det kompilerade temat.',
        themePreviewSingleImageDescription:
            'Den kompilerade ticker-bakgrunden efter att snitten har applicerats. Det här är filen OBS laddar.',
        themeMetadata: 'Temadetaljer',
        themeMetadataDescription:
            'Namn och skapare som sparas i temats metadatafil.',
        themeOverrides: 'Geometri-överskridningar',
        themeOverridesDescription:
            'Valfria procentsatser som åsidosätter de värden som beräknas från snitten. Lämna tomt för att använda de automatiskt beräknade värdena.',
        metricsLabelLeft: 'Etikett vänster',
        metricsLabelWidth: 'Etikettbredd',
        metricsViewportLeft: 'Viewport vänster',
        metricsViewportRight: 'Viewport höger',
        cutKeyboardHint:
            'Använd ← och → för att justera (håll Shift för 5%-steg).',
        uploadThemeZip: 'Ladda upp zip-tema',
        themeZip: 'Zip-tema',
        themeZipDescription:
            'Ladda upp en zip som innehåller title.png, content.png, end.png och matchande JSON-fil.',
        themeZipTooLarge: 'Filen är för stor. Maxstorlek är 10 MB.',
        deleteTheme: 'Ta bort tema',
        importTheme: 'Importera tema',
        addATheme: 'Lägg till ett tema',
        orSeparator: 'eller',
        themeImportDescription:
            'Importera ett tema från en delad URL eller ladda upp en zip-fil.',
        themeImportUrl: 'URL till zip-tema',
        importThemeFromUrl: 'Importera från URL',
        shareThemeUrl: 'Delnings-URL',
        shareThemeUrlDescription:
            'Skapa en publik zip-URL som du kan skicka till någon annan.',
        generateShareThemeUrl: 'Skapa delnings-URL',
        downloadThemeZip: 'Ladda ner zip',
        downloadThemeZipDescription: 'Ladda ner temat som ett zip-arkiv.',
        shareUrlDialogTitle: 'Skapar delnings-URL',
        shareUrlDialogDescription:
            'Ett publikt zip-arkiv för det här temat förbereds.',
        shareUrlProgressInitializing: 'Startar',
        shareUrlProgressCompressingTheme: 'Komprimerar tema',
        shareUrlProgressGeneratingArchive: 'Skapar komprimerat arkiv',
        shareUrlProgressGeneratingUrl: 'Skapar URL',
        shareUrlPending: 'Ingen delnings-URL ännu',
        shareUrlPendingDescription:
            'Skapa en delnings-URL för att göra zip-filen publik.',
        shareUrlReady: 'Delnings-URL klar',
        shareUrlError: 'Det gick inte att skapa en delnings-URL.',
        copyLink: 'Kopiera länk',
        createdBy: 'Skapat av',
        themeListEmpty: 'Inga teman hittades ännu.',
        shareTheme: 'Dela tema',
        importThemeNow: 'Importera tema',
        previous: 'Föregående',
        next: 'Nästa',
        copy: 'Kopiera',
        themePreview: 'Temapreview',
        themePreviewDescription:
            'Förhandsgranska det kompilerade temat och kontrollera de skapade filerna.',
        backToThemes: 'Tillbaka till teman',
        createAnotherTheme: 'Skapa ett nytt tema',
        todaysSubmissions: 'Dagens inskick',
        todaysSubmissionsDescription: 'Publika användartexter',
        user: 'Användare',
        bboxTitle: 'Beskär region',
        bboxTitleDescription:
            'Dra de fyra vertikala och två horisontella handtagen för att ringa in den del av källbilden som ska gå in i tickern. De mörka banden beskärs bort innan titel/innehåll/slut-snitten körs.',
        bboxKeyboardHintV:
            'Använd ← och → för att justera sidhandtagen (håll Shift för 5%-steg).',
        bboxKeyboardHintH:
            'Använd ↑ och ↓ för att justera topp/botten-handtagen (håll Shift för 5%-steg).',
        bboxPositionsLabel:
            'Beskär box: {top}%–{bottom}% vertikalt, {left}%–{right}% horisontellt.',
        bboxBandTop: 'Beskär {pct}% från toppen',
        bboxBandBottom: 'Beskär {pct}% från botten',
        bboxBandLeft: 'Beskär {pct}% från vänster',
        bboxBandRight: 'Beskär {pct}% från höger',
        bboxReset: 'Återställ beskär box',
        labelReset: 'Återställ etikettruta',
    },
} as const;

type MessageKey = keyof typeof messages.en;

/**
 * Format a translation template by replacing `{key}` placeholders with
 * the supplied values. Supports numeric params as well as strings so
 * preview percentages can be inlined into a sentence like
 * `Cuts at {split1}% and {split2}%` without forcing the caller to
 * pre-stringify them.
 */
function format(
    template: string,
    params?: Record<string, string | number>,
): string {
    if (params === undefined) {
        return template;
    }

    return Object.entries(params).reduce<string>(
        (result, [name, value]) =>
            result.replaceAll(`{${name}}`, String(value)),
        template,
    );
}

export function useTranslation() {
    const { auth } = usePage<{ auth: Auth }>().props;
    const locale = auth.user?.locale ?? 'en';

    return {
        locale,
        t: (
            key: MessageKey,
            params?: Record<string, string | number>,
        ): string =>
            format(messages[locale]?.[key] ?? messages.en[key] ?? key, params),
    };
}
