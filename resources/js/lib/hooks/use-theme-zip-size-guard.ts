import { useTranslation } from '@/lib/i18n';
import { formatFileSize } from '@/lib/text';

// Keep the "10 MB" copy in lib/i18n.ts themeZipTooLarge in sync with
// MAX_THEME_ZIP_SIZE_MB below.
const MAX_THEME_ZIP_SIZE_MB = 10;
const MAX_THEME_ZIP_SIZE_BYTES = MAX_THEME_ZIP_SIZE_MB * 1024 * 1024;

export type ThemeZipSizeGuard = {
    error: string | null;
    sizeLabel: string | null;
    maxMb: number;
};

export function useThemeZipSizeGuard(file: File | null): ThemeZipSizeGuard {
    const { t, locale } = useTranslation();

    const tooLarge = file !== null && file.size > MAX_THEME_ZIP_SIZE_BYTES;

    return {
        error: tooLarge ? t('themeZipTooLarge') : null,
        sizeLabel:
            file !== null ? `(${formatFileSize(file.size, locale)})` : null,
        maxMb: MAX_THEME_ZIP_SIZE_MB,
    };
}
