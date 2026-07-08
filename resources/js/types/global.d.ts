import type { Auth } from '@/types/auth';

declare module 'react' {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface InputHTMLAttributes<T> {
        passwordrules?: string;
    }
}

declare module '@inertiajs/core' {
    export interface InertiaConfig {
        sharedPageProps: {
            name: string;
            auth: Auth;
            sidebarOpen: boolean;
            canModerateThemes: boolean;
            themeOfficialCatalogEnabled: boolean;
            themeOfficialCatalogSubmissionEnabled: boolean;
            themeCatalogUrl: string | null;
            isOfficialCatalogHost: boolean;
            [key: string]: unknown;
        };
    }
}
