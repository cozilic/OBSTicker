import { Form, Head } from '@inertiajs/react';
import { ArrowRight, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function SubmitTickerText({ tickerName, submissionUrl }: { tickerName?: string | null; submissionUrl: string }) {
    return (
        <>
            <Head title="Skicka text" />
            <main className="min-h-screen bg-neutral-950 text-white">
                <div className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-10 px-5 py-10 md:grid-cols-[0.9fr_1.1fr]">
                    <section className="flex flex-col gap-5">
                        <div className="flex size-12 items-center justify-center rounded-md bg-cyan-400 text-neutral-950">
                            <Send className="size-5" />
                        </div>
                        <div className="space-y-3">
                            <h1 className="max-w-xl text-4xl leading-tight font-semibold tracking-normal md:text-5xl">
                                Skicka en text till sändningens lower-third
                            </h1>
                            <p className="max-w-lg text-base leading-7 text-neutral-300">
                                Din text hamnar i {tickerName ? `${tickerName}s ` : ''}kö och visas när pågående inslag är klart. När kön är tom visas nyheter från RSS.
                            </p>
                        </div>
                    </section>

                    <section className="rounded-lg border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/30 md:p-8">
                        <Form action={submissionUrl} method="post" resetOnSuccess className="flex flex-col gap-5">
                            {({ errors, processing, recentlySuccessful }) => (
                                <>
                                    <div className="grid gap-2">
                                        <Label htmlFor="submitter_name" className="text-neutral-200">
                                            Namn
                                        </Label>
                                        <Input
                                            id="submitter_name"
                                            name="submitter_name"
                                            placeholder="Valfritt"
                                            className="border-white/15 bg-white/5 text-white placeholder:text-neutral-500"
                                        />
                                    </div>

                                    <div className="grid gap-2">
                                        <Label htmlFor="content" className="text-neutral-200">
                                            Text
                                        </Label>
                                        <textarea
                                            id="content"
                                            name="content"
                                            maxLength={220}
                                            rows={5}
                                            className="rounded-md border border-white/15 bg-white/5 px-3 py-3 text-base text-white shadow-xs outline-none placeholder:text-neutral-500 focus-visible:border-cyan-300 focus-visible:ring-3 focus-visible:ring-cyan-300/20"
                                            placeholder="Skriv kort och tydligt..."
                                        />
                                        {errors.content && <p className="text-sm text-red-300">{errors.content}</p>}
                                    </div>

                                    {recentlySuccessful && (
                                        <div className="rounded-md border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-sm text-cyan-100">
                                            Texten ligger i kön.
                                        </div>
                                    )}

                                    <Button type="submit" disabled={processing} className="h-11 bg-cyan-300 text-neutral-950 hover:bg-cyan-200">
                                        Skicka till kön
                                        <ArrowRight />
                                    </Button>
                                </>
                            )}
                        </Form>
                    </section>
                </div>
            </main>
        </>
    );
}
