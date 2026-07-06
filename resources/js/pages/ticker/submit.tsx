import { Form, Head } from '@inertiajs/react';
import { ArrowRight, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type SubmitTickerTextProps = {
    tickerName?: string | null;
    submissionUrl: string;
    loginUrl: string;
    connectUrl: string;
    requiresTwitchAuth: boolean;
    requiresModerator: boolean;
    isModeratorAuthenticated: boolean;
    isTwitchAuthenticated: boolean;
    submitterName?: string | null;
};

export default function SubmitTickerText({
    tickerName,
    submissionUrl,
    loginUrl,
    connectUrl,
    requiresTwitchAuth,
    requiresModerator,
    isModeratorAuthenticated,
    isTwitchAuthenticated,
    submitterName,
}: SubmitTickerTextProps) {
    return (
        <>
            <Head title="Submit text" />
            <main className="min-h-screen bg-neutral-950 text-white">
                <div className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-10 px-5 py-10 md:grid-cols-[0.9fr_1.1fr]">
                    <section className="flex flex-col gap-5">
                        <div className="flex size-12 items-center justify-center rounded-md bg-cyan-400 text-neutral-950">
                            <Send className="size-5" />
                        </div>
                        <div className="space-y-3">
                            <h1 className="max-w-xl text-4xl leading-tight font-semibold tracking-normal md:text-5xl">
                                Send a message to the live lower-third
                            </h1>
                            <p className="max-w-lg text-base leading-7 text-neutral-300">
                                Your message goes into{' '}
                                {tickerName ? `${tickerName}'s ` : ''}queue and
                                appears when the current item finishes. When the
                                queue is empty, RSS headlines are shown.
                            </p>
                        </div>
                    </section>

                    <section className="rounded-lg border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/30 md:p-8">
                        {requiresModerator && !isModeratorAuthenticated ? (
                            <div className="flex flex-col gap-4">
                                <div className="space-y-2">
                                    <h2 className="text-lg font-medium text-white">
                                        Moderator access required
                                    </h2>
                                    <p className="text-sm leading-6 text-neutral-300">
                                        This ticker only accepts live score and
                                        event updates from the owner or
                                        moderators.
                                    </p>
                                </div>
                                <Button
                                    asChild
                                    className="h-11 w-fit bg-cyan-300 text-neutral-950 hover:bg-cyan-200"
                                >
                                    <a href={loginUrl}>Log in as moderator</a>
                                </Button>
                            </div>
                        ) : requiresTwitchAuth && !isTwitchAuthenticated ? (
                            <div className="flex flex-col gap-4">
                                <div className="space-y-2">
                                    <h2 className="text-lg font-medium text-white">
                                        Twitch login required
                                    </h2>
                                    <p className="text-sm leading-6 text-neutral-300">
                                        Connect with Twitch to submit a message.
                                        Your Twitch username will be used as the
                                        sender name.
                                    </p>
                                </div>
                                <Button
                                    asChild
                                    className="h-11 w-fit bg-[#9146FF] text-white hover:bg-[#7c3aed]"
                                >
                                    <a href={connectUrl}>Connect with Twitch</a>
                                </Button>
                            </div>
                        ) : (
                            <Form
                                action={submissionUrl}
                                method="post"
                                resetOnSuccess
                                className="flex flex-col gap-5"
                            >
                                {({
                                    errors,
                                    processing,
                                    recentlySuccessful,
                                }) => (
                                    <>
                                        <div className="grid gap-2">
                                            <Label
                                                htmlFor="submitter_name"
                                                className="text-neutral-200"
                                            >
                                                Name
                                            </Label>
                                            <Input
                                                id="submitter_name"
                                                name="submitter_name"
                                                defaultValue={
                                                    submitterName ?? ''
                                                }
                                                placeholder={
                                                    isTwitchAuthenticated
                                                        ? 'Twitch username'
                                                        : 'Optional'
                                                }
                                                readOnly={isTwitchAuthenticated}
                                                className="border-white/15 bg-white/5 text-white placeholder:text-neutral-500 read-only:cursor-default read-only:bg-white/10"
                                            />
                                            {isTwitchAuthenticated && (
                                                <p className="text-xs text-neutral-400">
                                                    Using your Twitch username.
                                                </p>
                                            )}
                                        </div>

                                        <div className="grid gap-2">
                                            <Label
                                                htmlFor="content"
                                                className="text-neutral-200"
                                            >
                                                Message
                                            </Label>
                                            <textarea
                                                id="content"
                                                name="content"
                                                maxLength={220}
                                                rows={5}
                                                className="rounded-md border border-white/15 bg-white/5 px-3 py-3 text-base text-white shadow-xs outline-none placeholder:text-neutral-500 focus-visible:border-cyan-300 focus-visible:ring-3 focus-visible:ring-cyan-300/20"
                                                placeholder="Keep it short and clear..."
                                            />
                                            {errors.content && (
                                                <p className="text-sm text-red-300">
                                                    {errors.content}
                                                </p>
                                            )}
                                        </div>

                                        {!isTwitchAuthenticated && (
                                            <Button
                                                asChild
                                                variant="outline"
                                                className="h-11 w-fit border-white/15 bg-white/5 text-white hover:bg-white/10"
                                            >
                                                <a href={connectUrl}>
                                                    Connect with Twitch
                                                </a>
                                            </Button>
                                        )}

                                        {recentlySuccessful && (
                                            <div className="rounded-md border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-sm text-cyan-100">
                                                Your message is in the queue.
                                            </div>
                                        )}

                                        <Button
                                            type="submit"
                                            disabled={processing}
                                            className="h-11 bg-cyan-300 text-neutral-950 hover:bg-cyan-200"
                                        >
                                            Send to queue
                                            <ArrowRight />
                                        </Button>
                                    </>
                                )}
                            </Form>
                        )}
                    </section>
                </div>
            </main>
        </>
    );
}
