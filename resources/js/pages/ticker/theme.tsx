import { Head, router, usePage } from '@inertiajs/react';
import { Info, RadioTower } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from '@/lib/i18n';
import type { Auth } from '@/types';

type PageProps = {
    auth: Auth;
};

export default function TickerTheme() {
    const { t } = useTranslation();
    const { auth } = usePage<PageProps>().props;
    const [themeName, setThemeName] = useState('');
    const [authorName, setAuthorName] = useState(auth.user?.name ?? '');
    const [leftImage, setLeftImage] = useState<File | null>(null);
    const [middleImage, setMiddleImage] = useState<File | null>(null);
    const [rightImage, setRightImage] = useState<File | null>(null);
    const [isStitching, setIsStitching] = useState(false);

    const handleStitchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        if (!leftImage || !middleImage || !rightImage) {
            return;
        }

        setIsStitching(true);
        const formData = new FormData(e.currentTarget);
        formData.set('theme_name', themeName);
        formData.set('author_name', authorName);
        formData.set('title_image', leftImage);
        formData.set('content_image', middleImage);
        formData.set('end_image', rightImage);
        formData.set('left_image', leftImage);
        formData.set('middle_image', middleImage);
        formData.set('right_image', rightImage);

        router.post('/ticker-admin/settings/stitch', formData, {
            onFinish: () => setIsStitching(false),
        });
    };

    return (
        <>
            <Head title={t('createTheme')} />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-normal">
                            {t('createTheme')}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {t('createThemeDescription')}
                        </p>
                    </div>
                    <Dialog>
                        <DialogTrigger asChild>
                            <Button variant="outline" size="sm" type="button">
                                <Info />
                                {t('createThemeTutorial')}
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-xl">
                            <DialogHeader>
                                <DialogTitle>
                                    {t('createThemeTutorial')}
                                </DialogTitle>
                                <DialogDescription>
                                    {t('createThemeTutorialDescription')}
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-3 text-sm text-muted-foreground">
                                <p>{t('createThemeTutorialStep1')}</p>
                                <p>{t('createThemeTutorialStep2')}</p>
                                <p>{t('createThemeTutorialStep3')}</p>
                                <p>{t('createThemeTutorialStep4')}</p>
                                <p>{t('createThemeTutorialStep5')}</p>
                                <p>{t('createThemeTutorialStep6')}</p>
                                <p className="text-foreground">
                                    {t('createThemeTutorialNote')}
                                </p>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>

                <Card className="h-fit rounded-lg">
                    <CardHeader>
                        <CardTitle>{t('createTheme')}</CardTitle>
                        <CardDescription>
                            {t('createThemeDescription')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form
                            onSubmit={handleStitchSubmit}
                            className="flex flex-col gap-4"
                        >
                            <div>
                                <Label htmlFor="theme_name">
                                    {t('themeName')}
                                </Label>
                                <Input
                                    id="theme_name"
                                    name="theme_name"
                                    type="text"
                                    value={themeName}
                                    onChange={(e) =>
                                        setThemeName(e.target.value)
                                    }
                                    placeholder="scoreboard-dark"
                                    required
                                    className="mt-1"
                                />
                            </div>
                            <div>
                                <Label htmlFor="author_name">
                                    {t('authorName')}
                                </Label>
                                <Input
                                    id="author_name"
                                    name="author_name"
                                    type="text"
                                    value={authorName}
                                    onChange={(e) =>
                                        setAuthorName(e.target.value)
                                    }
                                    placeholder="Patrik Forsberg"
                                    required
                                    className="mt-1"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label htmlFor="custom_label_left">
                                        {t('labelLeft')}
                                    </Label>
                                    <Input
                                        id="custom_label_left"
                                        name="custom_label_left"
                                        type="text"
                                        defaultValue="0%"
                                        className="mt-1"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="custom_label_width">
                                        {t('labelWidth')}
                                    </Label>
                                    <Input
                                        id="custom_label_width"
                                        name="custom_label_width"
                                        type="text"
                                        placeholder="13.25%"
                                        className="mt-1"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="custom_viewport_left">
                                        {t('viewportLeft')}
                                    </Label>
                                    <Input
                                        id="custom_viewport_left"
                                        name="custom_viewport_left"
                                        type="text"
                                        placeholder="23%"
                                        className="mt-1"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="custom_viewport_right">
                                        {t('viewportRight')}
                                    </Label>
                                    <Input
                                        id="custom_viewport_right"
                                        name="custom_viewport_right"
                                        type="text"
                                        placeholder="9.5%"
                                        className="mt-1"
                                    />
                                </div>
                            </div>
                            <div>
                                <Label htmlFor="title_image">
                                    {t('titleImage')}
                                </Label>
                                <Input
                                    id="title_image"
                                    type="file"
                                    accept="image/png,image/jpeg,image/jpg"
                                    onChange={(e) =>
                                        setLeftImage(e.target.files?.[0] ?? null)
                                    }
                                    required
                                    className="mt-1"
                                />
                            </div>
                            <div>
                                <Label htmlFor="content_image">
                                    {t('contentImage')}
                                </Label>
                                <Input
                                    id="content_image"
                                    type="file"
                                    accept="image/png,image/jpeg,image/jpg"
                                    onChange={(e) =>
                                        setMiddleImage(
                                            e.target.files?.[0] ?? null,
                                        )
                                    }
                                    required
                                    className="mt-1"
                                />
                            </div>
                            <div>
                                <Label htmlFor="end_image">
                                    {t('endImage')}
                                </Label>
                                <Input
                                    id="end_image"
                                    type="file"
                                    accept="image/png,image/jpeg,image/jpg"
                                    onChange={(e) =>
                                        setRightImage(e.target.files?.[0] ?? null)
                                    }
                                    required
                                    className="mt-1"
                                />
                            </div>
                            <Button
                                type="submit"
                                disabled={
                                    isStitching ||
                                    !leftImage ||
                                    !middleImage ||
                                    !rightImage
                                }
                            >
                                <RadioTower />
                                {t('stitchAndApplyTheme')}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}
