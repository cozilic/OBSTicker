import type { ImgHTMLAttributes } from 'react';

export default function AppLogoIcon(
    props: ImgHTMLAttributes<HTMLImageElement>,
) {
    return (
        <img
            {...props}
            src="/images/ticker-logo.png"
            alt="OBS Ticker"
            className={['block object-contain', props.className ?? '']
                .filter(Boolean)
                .join(' ')}
            loading="eager"
        />
    );
}
