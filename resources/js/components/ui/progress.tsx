import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';

type ProgressProps = HTMLAttributes<HTMLDivElement> & {
    value?: number;
    max?: number;
    indicatorClassName?: string;
};

// CSS-only Progress bar. Mirrors the shadcn visual contract (relative +
// bg-secondary track + bg-primary indicator growing left-to-right via a
// transform) without depending on @radix-ui/react-progress, which isn't
// installed in this project yet. When Radix is added later this file can
// be swapped for the generated version with one-line changes.
//
// `value` is a 0..100 percentage (or whatever `max` represents). The
// indicator is rendered via translate so frames paint at whatever pace
// the caller drives — typically a requestAnimationFrame loop on a
// simulated ramp. We intentionally do NOT apply a CSS transition here:
// the JS ramp already produces a smooth cubic-ease-out curve, so a
// `transition-transform` would (a) cause the visual bar to lag the
// simulated percent label by the transition duration on every tick,
// and (b) slide the bar smoothly backwards on error/abort resets
// instead of snapping to 0% as intended.
export function Progress({
    value = 0,
    max = 100,
    className,
    indicatorClassName,
    ...props
}: ProgressProps) {
    const safeMax = max === 0 ? 1 : max;
    const clampedValue = Math.min(safeMax, Math.max(0, value));
    const percentage = (clampedValue / safeMax) * 100;

    return (
        <div
            {...props}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={safeMax}
            aria-valuenow={clampedValue}
            className={cn(
                'relative h-2 w-full overflow-hidden rounded-full bg-secondary',
                className,
            )}
        >
            <div
                className={cn(
                    'h-full w-full bg-primary',
                    indicatorClassName,
                )}
                style={{ transform: `translateX(-${100 - percentage}%)` }}
            />
        </div>
    );
}
