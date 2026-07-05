import { usePage } from '@inertiajs/react';
import type { Auth } from '@/types';

export type Locale = Auth['user']['locale'];

const messages = {
    en: {
        activeRss: 'Active RSS',
        activeRssDescription: 'Feeds that fill an empty queue',
        admin: 'Admin',
        appearance: 'Appearance',
        done: 'Done',
        latestMessages: 'Latest messages',
        latestMessagesDescription: 'Recent submissions and admin messages in the ticker feed.',
        language: 'Language',
        languageDescription: 'Choose the language used in the admin interface.',
        languageSettings: 'Language settings',
        languageSettingsDescription: 'Choose your preferred admin language.',
        logOut: 'Log out',
        messagesHavePlayed: 'messages have played',
        moderators: 'Moderators',
        noMessagesYet: 'No messages yet.',
        overview: 'Overview',
        overviewDescription: 'Queue, RSS, and moderator activity at a glance.',
        playing: 'Playing',
        playingNow: 'playing now',
        profile: 'Profile',
        queued: 'Queued',
        save: 'Save',
        security: 'Security',
        settings: 'Settings',
        settingsDescription: 'Manage your profile and account settings',
        submissionPage: 'Submission page',
        todaysSubmissions: "Today's submissions",
        todaysSubmissionsDescription: 'Public audience messages',
        user: 'User',
    },
    sv: {
        activeRss: 'Aktiva RSS',
        activeRssDescription: 'Källor som kan fylla tom kö',
        admin: 'Admin',
        appearance: 'Utseende',
        done: 'Klar',
        latestMessages: 'Senaste texter',
        latestMessagesDescription: 'De senaste inskicken och admintexterna i tickerflödet.',
        language: 'Språk',
        languageDescription: 'Välj språk för administrationsgränssnittet.',
        languageSettings: 'Språkinställningar',
        languageSettingsDescription: 'Välj önskat språk för admin.',
        logOut: 'Logga ut',
        messagesHavePlayed: 'texter har spelats',
        moderators: 'Moderatorer',
        noMessagesYet: 'Inga texter ännu.',
        overview: 'Överblick',
        overviewDescription: 'Överblick över kö, RSS och moderatorer.',
        playing: 'Spelas',
        playingNow: 'spelas just nu',
        profile: 'Profil',
        queued: 'I kö',
        save: 'Spara',
        security: 'Säkerhet',
        settings: 'Inställningar',
        settingsDescription: 'Hantera profil- och kontoinställningar',
        submissionPage: 'Inskickssida',
        todaysSubmissions: 'Dagens inskick',
        todaysSubmissionsDescription: 'Publika användartexter',
        user: 'Användare',
    },
} as const;

type MessageKey = keyof typeof messages.en;

export function useTranslation() {
    const { auth } = usePage<{ auth: Auth }>().props;
    const locale = auth.user?.locale ?? 'en';

    return {
        locale,
        t: (key: MessageKey) => messages[locale]?.[key] ?? messages.en[key],
    };
}
