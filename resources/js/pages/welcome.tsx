import { Head, Link, usePage } from '@inertiajs/react';
import { LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { dashboard, login } from '@/routes';

export default function Welcome() {
    const { auth } = usePage().props;

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
                    <Button variant="outline" size="sm" asChild className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                        <Link href={auth.user ? dashboard() : login()}>
                            <LogIn />
                            Admin login
                        </Link>
                    </Button>
                </header>

                <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 py-14 md:min-h-[calc(100vh-88px)] md:grid-cols-[1fr_0.9fr]">
                    <div className="flex flex-col gap-7">
                        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-sm text-cyan-100">
                            Live lower-third för OBS Browser Source
                        </div>
                        <div className="space-y-5">
                            <h1 className="max-w-3xl text-5xl leading-[1.02] font-semibold tracking-normal md:text-7xl">
                                Publik text och RSS i samma snygga ticker.
                            </h1>
                            <p className="max-w-2xl text-lg leading-8 text-neutral-300">
                                Låt tittare skicka in korta meddelanden. När kön är tom fyller RSS-flöden lower-third-raden automatiskt.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <Button size="lg" variant="outline" asChild className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                                <Link href={auth.user ? dashboard() : login()}>
                                    Admin login
                                </Link>
                            </Button>
                        </div>
                    </div>

                    <div className="relative overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/40">
                        <div className="mb-6 flex items-center justify-between text-sm text-neutral-400">
                            <span>OBS preview</span>
                            <span>Browser Source</span>
                        </div>
                        <div className="aspect-video overflow-hidden rounded-md bg-neutral-900">
                            <div className="flex h-full items-end pb-10">
                                <div className="grid h-16 w-full grid-cols-[170px_1fr] overflow-hidden bg-neutral-800 shadow-2xl">
                                    <div className="flex items-center justify-center bg-cyan-300 px-5 text-sm font-bold text-neutral-950 uppercase">
                                        Senaste text
                                    </div>
                                    <div className="flex min-w-0 items-center px-6 text-xl font-semibold">
                                        <span className="truncate">Patrik: Kan ni visa nästa gäst igen?</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="mt-5 grid gap-3 text-sm text-neutral-300 sm:grid-cols-3">
                            <div className="rounded-md bg-white/5 p-3">Kö före RSS</div>
                            <div className="rounded-md bg-white/5 p-3">Animation in/ut</div>
                            <div className="rounded-md bg-white/5 p-3">Moderatorläge</div>
                        </div>
                    </div>
                </section>
            </main>
        </>
    );
}
