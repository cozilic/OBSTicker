import { Link, usePage } from '@inertiajs/react';
import { FolderOpen, Inbox, LayoutGrid, RadioTower } from 'lucide-react';
import AppLogo from '@/components/app-logo';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useTranslation } from '@/lib/i18n';
import { dashboard } from '@/routes';
import { dashboard as tickerDashboard } from '@/routes/ticker';
import type { NavItem } from '@/types';

const platformNavItems: NavItem[] = [
    {
        title: 'overview',
        href: dashboard(),
        icon: LayoutGrid,
    },
];

const tickerNavItems: NavItem[] = [
    {
        title: 'Ticker',
        href: tickerDashboard(),
        icon: RadioTower,
    },
    {
        title: 'Themes',
        href: '/ticker-admin/themes',
        icon: FolderOpen,
    },
    {
        title: 'Create theme',
        href: '/ticker-admin/theme',
        icon: RadioTower,
    },
    {
        title: 'Theme submissions',
        href: '/ticker-admin/theme-submissions',
        icon: Inbox,
    },
];

const translateNavItems = (
    items: NavItem[],
    t: (key: 'overview' | 'ticker' | 'themes' | 'createTheme' | 'themeSubmissions') => string,
) =>
    items.map((item) => ({
        ...item,
        title:
            item.title === 'overview'
                ? t('overview')
                : item.title === 'Ticker'
                  ? t('ticker')
                  : item.title === 'Themes'
                    ? t('themes')
                  : item.title === 'Create theme'
                    ? t('createTheme')
                  : item.title === 'Theme submissions'
                    ? t('themeSubmissions')
                    : item.title,
    }));

export function AppSidebar() {
    const { t } = useTranslation();
    const { features, canModerateThemes } = usePage<{
        features: { themeCatalogEnabled: boolean };
        canModerateThemes: boolean;
    }>().props;
    const translatedPlatformNavItems = translateNavItems(platformNavItems, t);
    const translatedTickerNavItems = translateNavItems(
        tickerNavItems.filter((item) =>
            features.themeCatalogEnabled || item.title !== 'Themes',
        ),
        t,
    );
    const filteredTickerNavItems = canModerateThemes
        ? translatedTickerNavItems
        : translatedTickerNavItems.filter((item) => item.title !== t('themeSubmissions'));

    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link href={dashboard()} prefetch>
                                <AppLogo />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                <NavMain label={t('platform')} items={translatedPlatformNavItems} />
                <NavMain label={t('ticker')} items={filteredTickerNavItems} />
            </SidebarContent>

            <SidebarFooter>
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
