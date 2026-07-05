import { Form, Head, usePage } from '@inertiajs/react';
import LanguageController from '@/actions/App/Http/Controllers/Settings/LanguageController';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useTranslation } from '@/lib/i18n';
import { edit } from '@/routes/language';
import type { Auth } from '@/types';

type LocaleOption = {
    value: Auth['user']['locale'];
    label: string;
};

type PageProps = {
    auth: Auth;
    locales: LocaleOption[];
};

export default function Language() {
    const { auth, locales } = usePage<PageProps>().props;
    const { t } = useTranslation();

    return (
        <>
            <Head title={t('languageSettings')} />

            <h1 className="sr-only">{t('languageSettings')}</h1>

            <div className="space-y-6">
                <Heading
                    variant="small"
                    title={t('languageSettings')}
                    description={t('languageSettingsDescription')}
                />

                <Form
                    {...LanguageController.update.form()}
                    options={{
                        preserveScroll: true,
                    }}
                    className="space-y-6"
                >
                    {({ processing, errors }) => (
                        <>
                            <div className="grid gap-2">
                                <Label htmlFor="locale">{t('language')}</Label>

                                <select
                                    id="locale"
                                    name="locale"
                                    defaultValue={auth.user.locale}
                                    className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                                >
                                    {locales.map((locale) => (
                                        <option key={locale.value} value={locale.value}>
                                            {locale.label}
                                        </option>
                                    ))}
                                </select>

                                <InputError className="mt-2" message={errors.locale} />
                            </div>

                            <div className="flex items-center gap-4">
                                <Button disabled={processing}>{t('save')}</Button>
                            </div>
                        </>
                    )}
                </Form>
            </div>
        </>
    );
}

Language.layout = {
    breadcrumbs: [
        {
            title: 'Language settings',
            href: edit(),
        },
    ],
};
