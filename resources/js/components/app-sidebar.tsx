import { Link } from '@inertiajs/react';
import { LayoutGrid, RadioTower } from 'lucide-react';
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

const mainNavItems: NavItem[] = [
    {
        title: 'overview',
        href: dashboard(),
        icon: LayoutGrid,
    },
    {
        title: 'Ticker',
        href: tickerDashboard(),
        icon: RadioTower,
    },
];

export function AppSidebar() {
    const { t } = useTranslation();
    const translatedMainNavItems = mainNavItems.map((item) => ({
        ...item,
        title: item.title === 'overview' ? t('overview') : item.title,
    }));

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
                <NavMain items={translatedMainNavItems} />
            </SidebarContent>

            <SidebarFooter>
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
