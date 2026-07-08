import { Head, Link, usePage } from '@inertiajs/react';
import { Download, Github, LogIn, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { dashboard, login } from '@/routes';

const repositoryUrl = 'https://github.com/cozilic/OBSTicker';

export default function Welcome() {
    const { auth, features } = usePage<{
        auth: { user: { id: number } | null };
        features: { themeLandingLinkEnabled: boolean };
    }>().props;

    return (
        <>
            <Head title="OBS Lower-third Ticker" />
            <main className="min-h-screen bg-neutral-950 text-white">
                <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
                    <Link href="/" className="flex items-center">
                        <img
                            src="/images/ticker-logo.png"
                            alt="OBS Ticker"
                            className="h-9 w-auto"
                        />
                    </Link>
                    <div className="flex items-center gap-2">
                        {features.themeLandingLinkEnabled ? (
                            <Button
                                variant="outline"
                                size="sm"
                                asChild
                                className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                            >
                                <Link href="/themes">
                                    <FolderOpen />
                                    Themes
                                </Link>
                            </Button>
                        ) : null}
                        <Button
                            variant="outline"
                            size="sm"
                            asChild
                            className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                        >
                            <Link href={auth.user ? dashboard() : login()}>
                                <LogIn />
                                Admin login
                            </Link>
                        </Button>
                    </div>
                </header>

                <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 py-14 md:min-h-[calc(100vh-88px)] md:grid-cols-[1fr_0.9fr]">
                    <div className="flex flex-col gap-7">
                        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-sm text-cyan-100">
                            Live lower-third for OBS Browser Source
                        </div>
                        <div className="space-y-5">
                            <h1 className="max-w-3xl text-5xl leading-[1.02] font-semibold tracking-normal md:text-7xl">
                                Audience messages and RSS in one polished
                                ticker.
                            </h1>
                            <p className="max-w-2xl text-lg leading-8 text-neutral-300">
                                Let viewers send short messages. When the queue
                                is empty, RSS feeds automatically fill the
                                lower-third.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <Button
                                size="lg"
                                variant="outline"
                                asChild
                                className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                            >
                                <Link href={auth.user ? dashboard() : login()}>
                                    Admin login
                                </Link>
                            </Button>
                            <Button
                                size="lg"
                                asChild
                                className="bg-cyan-300 text-neutral-950 hover:bg-cyan-200"
                            >
                                <a
                                    href={repositoryUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    <Github />
                                    View on GitHub
                                </a>
                            </Button>
                        </div>
                    </div>

                    <div className="relative overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] p-3 shadow-2xl shadow-black/40">
                        <img
                            src="/images/home-screenshot.png"
                            alt="OBSTicker running as a lower-third news ticker overlay in a game stream"
                            className="aspect-video w-full rounded-md object-cover"
                        />
                        <div className="mt-5 grid gap-3 text-sm text-neutral-300 sm:grid-cols-3">
                            <div className="rounded-md bg-white/5 p-3">
                                Queue before RSS
                            </div>
                            <div className="rounded-md bg-white/5 p-3">
                                Animation in/out
                            </div>
                            <div className="rounded-md bg-white/5 p-3">
                                Moderator mode
                            </div>
                        </div>
                    </div>
                </section>

                <section className="border-t border-white/10 bg-white/[0.02]">
                    <div className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-12 md:grid-cols-[0.9fr_1.1fr] md:items-center">
                        <div className="flex flex-col gap-4">
                            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm text-neutral-200">
                                <Download className="size-4" />
                                Download and self-host
                            </div>
                            <div className="space-y-3">
                                <h2 className="text-3xl leading-tight font-semibold tracking-normal md:text-4xl">
                                    Run OBSTicker on your own server.
                                </h2>
                                <p className="max-w-2xl text-base leading-7 text-neutral-300">
                                    OBSTicker is open source. Clone it from
                                    GitHub, deploy it like a normal Laravel app,
                                    and point OBS Browser Source to your own
                                    ticker URL.
                                </p>
                            </div>
                        </div>

                        <div className="grid gap-3 text-sm text-neutral-300 sm:grid-cols-3">
                            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                                <div className="text-base font-semibold text-white">
                                    Laravel deploy
                                </div>
                                <p className="mt-2 leading-6">
                                    Composer, Node, database migrations, and a
                                    production build.
                                </p>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                                <div className="text-base font-semibold text-white">
                                    OBS ready
                                </div>
                                <p className="mt-2 leading-6">
                                    Use `/ticker` as a Browser Source and
                                    `/submit` for viewer messages.
                                </p>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                                <div className="text-base font-semibold text-white">
                                    Source available
                                </div>
                                <p className="mt-2 leading-6">
                                    <a
                                        href={repositoryUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 text-cyan-200 hover:text-cyan-100"
                                    >
                                        GitHub repository
                                        <Github className="size-4" />
                                    </a>
                                </p>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </>
    );
}
