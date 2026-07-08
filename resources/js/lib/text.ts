type FitTextOptions = {
    maxSize: number;
    minSize: number;
    threshold: number;
    shrinkPerCharacter: number;
};

export function fitTextToLength(text: string, options: FitTextOptions): number {
    const normalizedLength = text.trim().length;
    const overflow = Math.max(0, normalizedLength - options.threshold);

    return Math.max(
        options.minSize,
        Math.min(
            options.maxSize,
            options.maxSize - overflow * options.shrinkPerCharacter,
        ),
    );
}

type FitTextWidthOptions = {
    maxSize: number;
    minSize: number;
    maxWidth: number;
    fontFamily?: string;
    fontWeight?: string;
};

export function fitTextToWidth(
    text: string,
    options: FitTextWidthOptions,
): number {
    if (typeof document === 'undefined' || options.maxWidth <= 0) {
        return options.minSize;
    }

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
        return options.minSize;
    }

    const family = options.fontFamily ?? 'Instrument Sans, sans-serif';
    const weight = options.fontWeight ?? '600';

    for (let size = options.maxSize; size >= options.minSize; size -= 1) {
        context.font = `${weight} ${size}px ${family}`;

        if (context.measureText(text).width <= options.maxWidth) {
            return size;
        }
    }

    return options.minSize;
}
