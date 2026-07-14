import { Head, router, usePage } from '@inertiajs/react';
import {
    AlertCircle,
    Crop,
    Eye,
    ImageIcon,
    RotateCcw,
    Scissors,
    Spline,
    ZoomIn,
    ZoomOut,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
    KeyboardEvent as ReactKeyboardEvent,
    PointerEvent as ReactPointerEvent,
    SyntheticEvent,
} from 'react';
import InputError from '@/components/input-error';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { useTranslation } from '@/lib/i18n';
import type { Auth } from '@/types';

type PageProps = { auth: Auth };

// WYCIWYG: the slice endpoint no longer returns any label/viewport
// metrics overrides — the live ticker derives its positioning purely
// from the theme's meta.json (cuts + bbox). Preview requests only
// stream back the base64 PNG and we compare it visually here.

// Minimum slack between any two adjacent handles so the slot always
// has a usable minimum size. Mirrors the 1% gap the controller
// enforces via Laravel validation; the frontend applies the same
// rule locally so sliders never push past each other mid-drag.
const MIN_GAP = 1;
const DEFAULT_SPLIT_1 = 20;
const DEFAULT_SPLIT_2 = 80;
// Bbox defaults span the entire source so a freshly-loaded image
// behaves exactly as before — the user opts into bbox cropping by
// moving a handle inward.
const DEFAULT_BBOX_LEFT = 0;
const DEFAULT_BBOX_RIGHT = 100;
const DEFAULT_BBOX_TOP = 0;
const DEFAULT_BBOX_BOTTOM = 100;

// Manual label-box edge gap. The controller's SLIDER_GAP_PERCENT / 2
// is the contract — half-percent minimum slack on each edge so the
// validator's "fits inside slot" rule stays satisfied server-side.
const LABEL_MIN_GAP = 0.5;
// Zoom is purely a view affordance. Scaling the inner <img> via
// transform: scale(zoom) does NOT change where handles land
// relative to the source because surfaceRef.getBoundingClientRect()
// determines the math anchor for pointerToXPercent/YPercent. The
// image clips at the surface edges once the user zooms past 1:1
// (overflow:hidden); handles + crop bands stay percent-anchored
// and remain draggable.
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;
const ZOOM_DEFAULT = 1;
// The validator caps source_image at 4 MB (Laravel max:4096 KB).
// Most shared-host PHP installs cap raw uploads at 2 MB via
// upload_max_filesize, and the web server body limit often tops
// out at 1 MB by default. We mirror the validator's cap locally
// so we can short-circuit the network call before the artist
// spends a roundtrip on a guaranteed 422; the precise server
// cap is documented in docs/deployment/upload-limits.md and
// surfaced in the alert text when Laravel's "failed to upload"
// wording comes back.
const MAX_SOURCE_BYTES = 4096 * 1024;

type VerticalHandle = 'left' | 'split1' | 'split2' | 'right';
type HorizontalHandle = 'top' | 'bottom';
// Label box has 4 edges (matching the bbox-handle vocabulary so the
// keyboard-nudge handlers below can reuse the 1-unit Shift-arrow step
// without extra branches).
type LabelEdge = 'left' | 'right' | 'top' | 'bottom';

export default function TickerTheme() {
    const { t } = useTranslation();
    const { auth, errors } = usePage<
        PageProps & { errors: Record<string, string> }
    >().props;

    // Source image — held in two parallel forms: a File for the upload
    // payload and an objectURL for the <img> preview. The URL is
    // regenerated whenever the file changes and revoked on cleanup.
    const [sourceFile, setSourceFile] = useState<File | null>(null);
    const [sourceUrl, setSourceUrl] = useState<string | null>(null);
    const [naturalDims, setNaturalDims] = useState<{
        width: number;
        height: number;
    } | null>(null);

    // Two vertical cut positions (title→content and content→end).
    // Held in state so the dividers re-render smoothly while dragging
    // and so the parent can dispatch preview fetches on release.
    // Zoom state — multiplicative on the inner <img> via
    // transform: scale(zoom). The surface's bounding rect holds
    // steady so pointerToXPercent / YPercent resolve percentages
    // exactly as before zoom; only the visual size of the image
    // changes. Reset by handleFile on every fresh pick so the
    // artist starts over at 1:1.
    const [zoom, setZoom] = useState<number>(ZOOM_DEFAULT);

    // Pan offset (px) of the inner image div relative to the
    // surface once the user zooms past 1:1. The transform
    // `translate(panX, panY) scale(zoom)` is composed INSIDE the
    // surface's overflow-hidden box, so drag-handle math anchored
    // to surfaceRef.getBoundingClientRect() stays correct
    // regardless of how far the image has been pushed around
    // inside it. Resets to 0 on every fresh file, every image
    // load, and on the explicit zoomReset shortcut — selecting a
    // new source or hitting Cmd-0 gives a clean canvas, while
    // zoomIn / zoomOut preserve the pan so the user can navigate
    // by zooming + panning without losing their place.
    const [panX, setPanX] = useState<number>(0);
    const [panY, setPanY] = useState<number>(0);
    // Tracks the user's active pan drag so the surface cursor can
    // flip from `grab` to `grabbing` for the duration of the
    // gesture. Mirrors activePanRef.current but as state so the
    // JSX className can read it.
    const [isPanning, setIsPanning] = useState<boolean>(false);

    // Dynamic-content-stretch lets the content slot stretch across
    // the bounding-box right edge; the end region has zero width.
    // Off by default so existing themes keep their three-region
    // layout; opt-in flips split_2 to bboxRight via the useEffect
    // below.
    const [dynamicContentStretch, setDynamicContentStretch] =
        useState<boolean>(false);

    const [split1, setSplit1] = useState<number>(DEFAULT_SPLIT_1);
    const [split2, setSplit2] = useState<number>(DEFAULT_SPLIT_2);

    // Bounding-box handles — 2 horizontal + 4 vertical. All six are
    // expressed as absolute percentages of the source image so the
    // drag math never has to chase a recursive layout: a single
    // pointer position maps to a single percentage of one axis.
    const [bboxLeft, setBboxLeft] = useState<number>(DEFAULT_BBOX_LEFT);
    const [bboxRight, setBboxRight] = useState<number>(DEFAULT_BBOX_RIGHT);
    const [bboxTop, setBboxTop] = useState<number>(DEFAULT_BBOX_TOP);
    const [bboxBottom, setBboxBottom] = useState<number>(DEFAULT_BBOX_BOTTOM);

    // Manual label-box state. The artist drags the 4 edges of a
    // rectangle inside the title slot to position the headline overlay
    // — a manual substitute for the alpha-aware visibleBounds() path
    // that picked the wrong sub-region of the asymmetric title.png.
    // All four corners are stored as absolute percentages of the
    // source image so the live ticker can read them directly from
    // meta.json without a canvas-vs-source remap. Defaults fill the
    // entire title slot (from bboxLeft to split1, top to bottom) so
    // a freshly-loaded image behaves like the alpha-aware path did:
    // label span == title region span. The controller's validator
    // rejects commits where the box falls outside the slot.
    const [labelLeft, setLabelLeft] = useState<number>(DEFAULT_BBOX_LEFT);
    const [labelWidth, setLabelWidth] = useState<number>(
        Math.max(LABEL_MIN_GAP, DEFAULT_SPLIT_1 - DEFAULT_BBOX_LEFT),
    );
    const [labelTop, setLabelTop] = useState<number>(DEFAULT_BBOX_TOP);
    const [labelHeight, setLabelHeight] = useState<number>(
        Math.max(LABEL_MIN_GAP, DEFAULT_BBOX_BOTTOM - DEFAULT_BBOX_TOP),
    );

    // Preview state — the compiled PNG the backend produced on demand.
    // Fetched once on file load and again after every dragend so the
    // user always sees the latest compile.
    // previewProgress drives the in-section Progress bar. We can't
    // measure real upload body progress with fetch() so the value is
    // simulated via requestAnimationFrame: ease-out 0 -> 92% over
    // ~400ms, then settle until the response arrives. On success we
    // jump to 100%; on abort or error we snap back to 0%.
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [isPreviewing, setIsPreviewing] = useState<boolean>(false);
    const [previewProgress, setPreviewProgress] = useState<number>(0);

    // Commit metadata — persisted alongside the compiled theme on
    // submit.
    const [themeName, setThemeName] = useState<string>('');
    const [authorName, setAuthorName] = useState<string>(auth.user?.name ?? '');
    const [isCommitting, setIsCommitting] = useState<boolean>(false);

    // Drag math reads the wrapper rect; AbortController drops in-flight
    // preview requests when a new one starts so successive drags don't
    // race each other. progressRafRef tracks the simulated rAF chain's
    // most recent frame id so a fresh requestPreview call can cancel
    // the previous chain's last-scheduled frame before starting its own.
    const surfaceRef = useRef<HTMLDivElement>(null);
    // innerRef anchors the drag math to the transformed image div's
    // VISUAL bounding rect. `transform: translate(panX, panY) scale(zoom)`
    // applied to the inner div means the surface's bounding rect is
    // stable but the image has moved inside it; anchoring drag math
    // against `surfaceRef` would let the cursor's pointer trail detach
    // from the handle at zoom > 1. `innerRef.current.getBoundingClientRect()`
    // reflects the visual transform so (clientX - rect.left) / rect.width
    // continues to map pointer-to-percent correctly at any zoom level,
    // while `surfaceRef` remains the source of truth for pre-image
    // fallback and for the surface-level pan handler.
    const innerRef = useRef<HTMLDivElement | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const progressRafRef = useRef<number | null>(null);

    // Tracks the current vertical handle so a pointermove event
    // delivered from a captured pointer can route to the right
    // setters without us having to re-derive the handle from the
    // hit target on every tick.
    const activeVerticalRef = useRef<VerticalHandle | null>(null);
    const activeHorizontalRef = useRef<HorizontalHandle | null>(null);
    // Parallel refs for the label box's 4 edge handles. Same shape
    // as the bbox-handle refs — separate vertical/horizontal split
    // so a pointermove event can route to the right setter without
    // re-deriving the handle from the hit target.
    const activeLabelVerticalRef = useRef<LabelEdge | null>(null);
    const activeLabelHorizontalRef = useRef<LabelEdge | null>(null);

    // requestPreview captures the latest cuts/bbox in its closure, so
    // its identity flips whenever any value moves. We mirror it on a
    // ref so the auto-load effect can run on file change without
    // re-firing on every keystroke.
    const requestPreviewRef = useRef<() => Promise<void>>(() =>
        Promise.resolve(),
    );

    // Holds the latest object URL so we can revoke it on a new file
    // pick or component unmount.
    const lastUrlRef = useRef<string | null>(null);

    useEffect(
        () => (): void => {
            if (lastUrlRef.current !== null) {
                URL.revokeObjectURL(lastUrlRef.current);
                lastUrlRef.current = null;
            }
        },
        [],
    );

    const clamp = (value: number, min: number, max: number): number =>
        Math.min(max, Math.max(min, value));

    const zoomIn = useCallback((): void => {
        setZoom((current) => Math.min(ZOOM_MAX, current * 1.25));
    }, []);
    const zoomOut = useCallback((): void => {
        setZoom((current) => {
            const next = Math.max(ZOOM_MIN, current / 1.25);

            // Reset pan whenever the zoom drops to 1 (or below).
            // The functional updater reads the FRESH current zoom
            // before React commits the new one, so we know whether
            // the resulting zoom will fit the surface without
            // plumbing a zoomRef or using a set-state-in-effect
            // useEffect. The two setStates (zoom + panX/Y) batch
            // together in React's update queue so the user sees a
            // single render with the cleared state.
            if (next <= 1) {
                setPanX(0);
                setPanY(0);
            }

            return next;
        });
    }, []);
    const zoomReset = useCallback((): void => {
        setZoom(ZOOM_DEFAULT);
        setPanX(0);
        setPanY(0);
    }, []);

    // Lock split_2 to bboxRight whenever dynamic mode is on. The
    // user can still widen/narrow the right edge, so the effect
    // keeps split_2 in step with each bboxRight change. The
    // split_2 vertical handle is hidden in JSX while dynamic is on
    // so the artist sees no pinch-point they can't drag.
    // Dynamic content awareness collapses the end region onto
    // split_2 = bboxRight; the toggle callback drives both writes
    // so the user's selection is reflected immediately without a
    // useEffect re-render cycle.

    // Global Cmd/Ctrl keyboard shortcut so the artist can zoom
    // without leaving the canvas. '+' / '=' / '-' matches both the
    // numpad-plus and the shift-equals layouts; '0' resets to 1:1.
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent): void => {
            if (!(event.metaKey || event.ctrlKey)) {
                return;
            }

            if (event.key === '+' || event.key === '=') {
                event.preventDefault();
                zoomIn();
            } else if (event.key === '-') {
                event.preventDefault();
                zoomOut();
            } else if (event.key === '0') {
                event.preventDefault();
                zoomReset();
            }
        };
        window.addEventListener('keydown', onKeyDown);

        return (): void => {
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [zoomIn, zoomOut, zoomReset]);

    const handleImageLoad = (event: SyntheticEvent<HTMLImageElement>): void => {
        const img = event.currentTarget;
        setNaturalDims({ width: img.naturalWidth, height: img.naturalHeight });
        setPanX(0);
        setPanY(0);
    };

    const handleFile = (file: File | null): void => {
        setSourceFile(file);
        setNaturalDims(null);
        setPreviewUrl(null);
        setPreviewError(null);
        setZoom(ZOOM_DEFAULT);
        setPanX(0);
        setPanY(0);
        setSplit1(DEFAULT_SPLIT_1);
        setSplit2(DEFAULT_SPLIT_2);
        setBboxLeft(DEFAULT_BBOX_LEFT);
        setBboxRight(DEFAULT_BBOX_RIGHT);
        setBboxTop(DEFAULT_BBOX_TOP);
        setBboxBottom(DEFAULT_BBOX_BOTTOM);
        // Reset the label box to fill the entire title slot so
        // re-picking the same source doesn't inherit the previous
        // run's tighter placement (matches handleFile's all-new-
        // upload contract for bbox/cuts).
        setLabelLeft(DEFAULT_BBOX_LEFT);
        setLabelWidth(
            Math.max(LABEL_MIN_GAP, DEFAULT_SPLIT_1 - DEFAULT_BBOX_LEFT),
        );
        setLabelTop(DEFAULT_BBOX_TOP);
        setLabelHeight(
            Math.max(LABEL_MIN_GAP, DEFAULT_BBOX_BOTTOM - DEFAULT_BBOX_TOP),
        );

        if (lastUrlRef.current !== null) {
            URL.revokeObjectURL(lastUrlRef.current);
            lastUrlRef.current = null;
        }

        if (file !== null) {
            const url = URL.createObjectURL(file);
            lastUrlRef.current = url;
            setSourceUrl(url);
        } else {
            setSourceUrl(null);
        }
    };

    // Reset to the bbox-defaults so a re-pick of the same source
    // doesn't inherit the previous run's bbox — matches handleFile's
    // initial-state contract for an all-new upload.
    const handleResetBbox = (): void => {
        setBboxLeft(DEFAULT_BBOX_LEFT);
        setBboxRight(DEFAULT_BBOX_RIGHT);
        setBboxTop(DEFAULT_BBOX_TOP);
        setBboxBottom(DEFAULT_BBOX_BOTTOM);
        void requestPreviewRef.current();
    };

    // Reset the label box to fill the title slot. Independent of
    // handleResetBbox so the artist can keep their bbox crop while
    // starting over on the label rect (or vice versa) — the two
    // rects are conceptually separate regions of the source.
    const handleResetLabel = (): void => {
        setLabelLeft(bboxLeft);
        setLabelWidth(Math.max(LABEL_MIN_GAP, split1 - bboxLeft));
        setLabelTop(bboxTop);
        setLabelHeight(Math.max(LABEL_MIN_GAP, bboxBottom - bboxTop));
        void requestPreviewRef.current();
    };

    // Pan harness for the surface — middle-mouse-button drag OR
    // Cmd/Ctrl + left-click drag (the Mac-friendly fallback for
    // mice without an aux button). Pointer capture keeps the
    // move/up events flowing from outside the surface so a fast
    // drag never loses the gesture. Ref-based delta computation
    // decouples the start snapshot from current render-frame
    // values, which is critical because panX/panY updates during
    // the drag rewrite the active state on every move.
    const activePanRef = useRef<{
        pointerId: number;
        startClientX: number;
        startClientY: number;
        startPanX: number;
        startPanY: number;
    } | null>(null);

    const startPan = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>): void => {
            const isAux = event.button === 1;
            const isModifiedLeft =
                event.button === 0 && (event.ctrlKey || event.metaKey);

            if (!(isAux || isModifiedLeft)) {
                return;
            }

            // No point panning at 1:1 — the image still fits and
            // translate() would just visually shift a non-overflowed
            // element off-center.
            if (zoom <= 1) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            activePanRef.current = {
                pointerId: event.pointerId,
                startClientX: event.clientX,
                startClientY: event.clientY,
                startPanX: panX,
                startPanY: panY,
            };
            setIsPanning(true);
            event.currentTarget.setPointerCapture(event.pointerId);
        },
        [zoom, panX, panY],
    );

    const movePan = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>): void => {
            const active = activePanRef.current;

            if (active === null || active.pointerId !== event.pointerId) {
                return;
            }

            const dx = event.clientX - active.startClientX;
            const dy = event.clientY - active.startClientY;
            setPanX(active.startPanX + dx);
            setPanY(active.startPanY + dy);
        },
        [],
    );

    const endPan = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>): void => {
            if (
                activePanRef.current !== null &&
                activePanRef.current.pointerId === event.pointerId
            ) {
                activePanRef.current = null;
                setIsPanning(false);
            }
        },
        [],
    );

    // Convert a pointer event into a percentage of either axis of the
    // surface. Returns null when the surface isn't laid out yet.
    const pointerToXPercent = useCallback(
        (event: ReactPointerEvent | PointerEvent): number | null => {
            // Prefer the transformed inner div so the pointer math
            // tracks the VISIBLE zoomed+panned image. The surface is
            // stable but no longer matches the visual position once a
            // transform is applied; anchoring against the surface
            // would make a handle detach from the cursor at zoom > 1.
            const innerRect = innerRef.current?.getBoundingClientRect();

            if (innerRect !== undefined && innerRect.width > 0) {
                return clamp(
                    ((event.clientX - innerRect.left) / innerRect.width) * 100,
                    0,
                    100,
                );
            }

            const fallback = surfaceRef.current?.getBoundingClientRect();

            if (fallback === undefined || fallback.width === 0) {
                return null;
            }

            return clamp(
                ((event.clientX - fallback.left) / fallback.width) * 100,
                0,
                100,
            );
        },
        [],
    );

    const pointerToYPercent = useCallback(
        (event: ReactPointerEvent | PointerEvent): number | null => {
            const innerRect = innerRef.current?.getBoundingClientRect();

            if (innerRect !== undefined && innerRect.height > 0) {
                return clamp(
                    ((event.clientY - innerRect.top) / innerRect.height) * 100,
                    0,
                    100,
                );
            }

            const fallback = surfaceRef.current?.getBoundingClientRect();

            if (fallback === undefined || fallback.height === 0) {
                return null;
            }

            return clamp(
                ((event.clientY - fallback.top) / fallback.height) * 100,
                0,
                100,
            );
        },
        [],
    );

    // startDrag runs only on pointerdown for either orientation —
    // captures the pointer so move/up events keep flowing to the
    // divider even when the cursor leaves the rect, and moves focus
    // onto the divider so subsequent arrow-key presses nudge the
    // same handle.
    const startVerticalDrag = useCallback(
        (which: VerticalHandle) =>
            (event: ReactPointerEvent<HTMLDivElement>): void => {
                // Pan gestures (middle-button or Cmd/Ctrl + left-click)
                // must NOT activate the handle machinery — they belong
                // to startPan above. Bail early on non-zero buttons
                // AND on modifier keys so a stray Cmd-click from a
                // trackpad user doesn't accidentally crop their handle.
                if (event.button !== 0) {
                    return;
                }

                if (event.ctrlKey || event.metaKey || event.shiftKey) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                event.currentTarget.focus();
                activeVerticalRef.current = which;
            },
        [],
    );

    const startHorizontalDrag = useCallback(
        (which: HorizontalHandle) =>
            (event: ReactPointerEvent<HTMLDivElement>): void => {
                if (event.button !== 0) {
                    return;
                }

                if (event.ctrlKey || event.metaKey || event.shiftKey) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                event.currentTarget.focus();
                activeHorizontalRef.current = which;
            },
        [],
    );

    // Label-box drag-start variants. Same shape as the bbox handlers
    // but routing into the label refs so moveLabel* can disambiguate
    // which 4-edge box is being resized without inspecting the move
    // target on every tick.
    const startLabelVerticalDrag = useCallback(
        (which: LabelEdge) =>
            (event: ReactPointerEvent<HTMLDivElement>): void => {
                if (event.button !== 0) {
                    return;
                }

                if (event.ctrlKey || event.metaKey || event.shiftKey) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                event.currentTarget.focus();
                activeLabelVerticalRef.current = which;
            },
        [],
    );

    const startLabelHorizontalDrag = useCallback(
        (which: LabelEdge) =>
            (event: ReactPointerEvent<HTMLDivElement>): void => {
                if (event.button !== 0) {
                    return;
                }

                if (event.ctrlKey || event.metaKey || event.shiftKey) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                event.currentTarget.focus();
                activeLabelHorizontalRef.current = which;
            },
        [],
    );

    // Vertical-handle move logic. The min/max for each handle is
    // computed from its neighbors so the user can never push two
    // handles past each other.
    const moveVerticalDrag = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>): void => {
            if (event.buttons === 0 || activeVerticalRef.current === null) {
                return;
            }

            const pct = pointerToXPercent(event);

            if (pct === null) {
                return;
            }

            switch (activeVerticalRef.current) {
                case 'left':
                    setBboxLeft(clamp(pct, 0, split1 - MIN_GAP));
                    break;
                case 'split1':
                    setSplit1(clamp(pct, bboxLeft + MIN_GAP, split2 - MIN_GAP));
                    break;
                case 'split2':
                    setSplit2(
                        clamp(
                            pct,
                            split1 + MIN_GAP,
                            dynamicContentStretch
                                ? bboxRight
                                : bboxRight - MIN_GAP,
                        ),
                    );
                    break;
                case 'right':
                    setBboxRight(clamp(pct, split2 + MIN_GAP, 100));
                    break;
            }
        },
        [pointerToXPercent, split1, split2, bboxLeft, bboxRight],
    );

    const moveHorizontalDrag = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>): void => {
            if (event.buttons === 0 || activeHorizontalRef.current === null) {
                return;
            }

            const pct = pointerToYPercent(event);

            if (pct === null) {
                return;
            }

            switch (activeHorizontalRef.current) {
                case 'top':
                    setBboxTop(clamp(pct, 0, bboxBottom - MIN_GAP));
                    break;
                case 'bottom':
                    setBboxBottom(clamp(pct, bboxTop + MIN_GAP, 100));
                    break;
            }
        },
        [pointerToYPercent, bboxTop, bboxBottom],
    );

    // Label-box vertical drag — operates only on the 4 edges of the
    // label rect (left/right). The math projects the pointer into an
    // absolute source-percent coordinate, then clamps against
    // neighboring handlers so the user can never push two edges of
    // the SAME rect past each other. Width-only resizing, no
    // whole-box translation by design — drag two opposite edges to
    // move the box, or use the preview to re-anchor and re-drag.
    const moveLabelVerticalDrag = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>): void => {
            if (
                event.buttons === 0 ||
                activeLabelVerticalRef.current === null
            ) {
                return;
            }

            const pct = pointerToXPercent(event);

            if (pct === null) {
                return;
            }

            switch (activeLabelVerticalRef.current) {
                case 'left': {
                    // Drag-effect: position of left-edge in absolute
                    // pct, clamped to [bboxLeft, labelLeft+labelWidth-
                    // GAP]. Right edge stays where the user put it;
                    // only width resizes.
                    const labelRight = labelLeft + labelWidth;
                    const nextLeft = clamp(
                        pct,
                        bboxLeft,
                        labelRight - LABEL_MIN_GAP,
                    );
                    setLabelLeft(nextLeft);
                    setLabelWidth(labelRight - nextLeft);
                    break;
                }
                case 'right': {
                    // Right-edge in absolute pct. Width = pct - labelLeft.
                    const nextWidth = clamp(
                        pct - labelLeft,
                        LABEL_MIN_GAP,
                        Math.max(LABEL_MIN_GAP, split1 - labelLeft),
                    );
                    setLabelWidth(nextWidth);
                    break;
                }
                default:
                    break;
            }
        },
        [pointerToXPercent, bboxLeft, labelLeft, labelWidth, split1],
    );

    const moveLabelHorizontalDrag = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>): void => {
            if (
                event.buttons === 0 ||
                activeLabelHorizontalRef.current === null
            ) {
                return;
            }

            const pct = pointerToYPercent(event);

            if (pct === null) {
                return;
            }

            switch (activeLabelHorizontalRef.current) {
                case 'top': {
                    const labelBottom = labelTop + labelHeight;
                    const nextTop = clamp(
                        pct,
                        bboxTop,
                        labelBottom - LABEL_MIN_GAP,
                    );
                    setLabelTop(nextTop);
                    setLabelHeight(labelBottom - nextTop);
                    break;
                }
                case 'bottom': {
                    const nextHeight = clamp(
                        pct - labelTop,
                        LABEL_MIN_GAP,
                        Math.max(LABEL_MIN_GAP, bboxBottom - labelTop),
                    );
                    setLabelHeight(nextHeight);
                    break;
                }
                default:
                    break;
            }
        },
        [pointerToYPercent, bboxTop, bboxBottom, labelTop, labelHeight],
    );

    const endDrag = useCallback((): void => {
        activeVerticalRef.current = null;
        activeHorizontalRef.current = null;
        activeLabelVerticalRef.current = null;
        activeLabelHorizontalRef.current = null;
        void requestPreviewRef.current();
    }, []);

    // Vertical keyboard nudge — left/right arrows shift the active
    // handle. Step is 1% normally, 5% with Shift.
    const keyVerticalDrag = useCallback(
        (which: VerticalHandle) =>
            (event: ReactKeyboardEvent<HTMLDivElement>): void => {
                let direction = 0;

                if (event.key === 'ArrowLeft') {
                    direction = -1;
                } else if (event.key === 'ArrowRight') {
                    direction = 1;
                } else {
                    return;
                }

                event.preventDefault();
                const step = event.shiftKey ? 5 : 1;
                const delta = direction * step;

                switch (which) {
                    case 'left':
                        setBboxLeft(
                            clamp(bboxLeft + delta, 0, split1 - MIN_GAP),
                        );
                        break;
                    case 'split1':
                        setSplit1(
                            clamp(
                                split1 + delta,
                                bboxLeft + MIN_GAP,
                                split2 - MIN_GAP,
                            ),
                        );
                        break;
                    case 'split2':
                        setSplit2(
                            clamp(
                                split2 + delta,
                                split1 + MIN_GAP,
                                dynamicContentStretch
                                    ? bboxRight
                                    : bboxRight - MIN_GAP,
                            ),
                        );
                        break;
                    case 'right':
                        setBboxRight(
                            clamp(bboxRight + delta, split2 + MIN_GAP, 100),
                        );
                        break;
                }

                void requestPreviewRef.current();
            },
        [bboxLeft, bboxRight, split1, split2],
    );

    const keyHorizontalDrag = useCallback(
        (which: HorizontalHandle) =>
            (event: ReactKeyboardEvent<HTMLDivElement>): void => {
                let direction = 0;

                if (event.key === 'ArrowUp') {
                    direction = -1;
                } else if (event.key === 'ArrowDown') {
                    direction = 1;
                } else {
                    return;
                }

                event.preventDefault();
                const step = event.shiftKey ? 5 : 1;
                const delta = direction * step;

                if (which === 'top') {
                    setBboxTop(clamp(bboxTop + delta, 0, bboxBottom - MIN_GAP));
                } else {
                    setBboxBottom(
                        clamp(bboxBottom + delta, bboxTop + MIN_GAP, 100),
                    );
                }

                void requestPreviewRef.current();
            },
        [bboxTop, bboxBottom],
    );

    // Label-box keyboard nudge. Single handler that resolves all 4
    // edges from one place: arrow keys map to the matching axis
    // (left/right ↔ horizontal, top/bottom ↔ vertical; drag direction
    // is the direction the edge moves), shift-key multiplies the
    // step. Each edge's clamp mirrors the move handler so dragging
    // and key-nudging share the same bounds envelope.
    const keyLabelDrag = useCallback(
        (which: LabelEdge) =>
            (event: ReactKeyboardEvent<HTMLDivElement>): void => {
                let dx = 0;
                let dy = 0;

                if (event.key === 'ArrowLeft') {
                    dx = -1;
                } else if (event.key === 'ArrowRight') {
                    dx = 1;
                } else if (event.key === 'ArrowUp') {
                    dy = -1;
                } else if (event.key === 'ArrowDown') {
                    dy = 1;
                } else {
                    return;
                }

                event.preventDefault();
                const step = event.shiftKey ? 5 : 1;

                if (which === 'left') {
                    const newLeft = clamp(
                        labelLeft + dx * step,
                        bboxLeft,
                        labelLeft + labelWidth - LABEL_MIN_GAP,
                    );
                    setLabelLeft(newLeft);
                    setLabelWidth(labelLeft + labelWidth - newLeft);
                } else if (which === 'right') {
                    const nextWidth = clamp(
                        labelWidth + dx * step,
                        LABEL_MIN_GAP,
                        Math.max(LABEL_MIN_GAP, split1 - labelLeft),
                    );
                    setLabelWidth(nextWidth);
                } else if (which === 'top') {
                    const newTop = clamp(
                        labelTop + dy * step,
                        bboxTop,
                        labelTop + labelHeight - LABEL_MIN_GAP,
                    );
                    setLabelTop(newTop);
                    setLabelHeight(labelTop + labelHeight - newTop);
                } else {
                    const nextHeight = clamp(
                        labelHeight + dy * step,
                        LABEL_MIN_GAP,
                        Math.max(LABEL_MIN_GAP, bboxBottom - labelTop),
                    );
                    setLabelHeight(nextHeight);
                }
            },
        [
            bboxLeft,
            bboxTop,
            bboxBottom,
            labelLeft,
            labelWidth,
            labelTop,
            labelHeight,
            split1,
        ],
    );

    // POST the current splits+bbox to /preview and render the
    // returned base64 PNG + metrics. Aborts any in-flight request so
    // a fast drag → drag sequence can't return images out of order.
    // Manual label rect — clamped to fit both the title slot
    // horizontally ([bboxLeft..split1]) and the bbox vertically
    // ([bboxTop..bboxBottom]). Without this derive, a bbox handle
    // move can leave the label rect's STATE overshooting the new
    // artwork region while the validator's "label box must stay
    // inside the bounding box vertically" rule fires a 422. The
    // user's true intent stays in {labelLeft, labelWidth, labelTop,
    // labelHeight}; this derived rect is what the artist actually
    // sees in the overlay + what requestPreview/handleCommit send
    // to the controller. State moves backward when the bbox grows
    // past the stored rect (auto-unclamp) so un-cropping restores
    // the original intent instead of leaving it clamped forever.
    // Declared here (before requestPreview) so the useCallback's
    // deps array can include labelRect without tripping
    // JavaScript's temporal dead zone.
    const labelRect = useMemo(() => {
        // Horizontal slot: [bboxLeft, split1]
        let nextLeft = labelLeft;

        if (nextLeft < bboxLeft) {
            nextLeft = bboxLeft;
        }

        let nextWidth = labelWidth;

        if (nextLeft + nextWidth > split1) {
            nextWidth = Math.max(LABEL_MIN_GAP, split1 - nextLeft);
        }

        if (nextWidth < LABEL_MIN_GAP) {
            nextWidth = LABEL_MIN_GAP;
            nextLeft = Math.min(nextLeft, split1 - LABEL_MIN_GAP);
        }

        // Vertical slot: [bboxTop, bboxBottom]
        let nextTop = labelTop;

        if (nextTop < bboxTop) {
            nextTop = bboxTop;
        }

        let nextHeight = labelHeight;

        if (nextTop + nextHeight > bboxBottom) {
            nextHeight = Math.max(LABEL_MIN_GAP, bboxBottom - nextTop);
        }

        if (nextHeight < LABEL_MIN_GAP) {
            nextHeight = LABEL_MIN_GAP;
            nextTop = Math.min(nextTop, bboxBottom - LABEL_MIN_GAP);
        }

        return {
            left: nextLeft,
            width: nextWidth,
            top: nextTop,
            height: nextHeight,
        };
    }, [
        labelLeft,
        labelWidth,
        labelTop,
        labelHeight,
        bboxLeft,
        bboxTop,
        bboxBottom,
        split1,
    ]);

    const requestPreview = useCallback(async (): Promise<void> => {
        if (sourceFile === null) {
            return;
        }

        // Pre-flight: reject above-Laravel-cap picks before the
        // network roundtrip. Without this guard the artist lands
        // on Laravel's generic "source_image: failed to upload."
        // 422 (which actually means PHP dropped the upload), and
        // the only way to know it's an over-cap rejection is the
        // message body. Surfacing the size here means the
        // auto-fire useEffect on sourceFile change picks up the
        // hint immediately on file pick.
        if (sourceFile.size > MAX_SOURCE_BYTES) {
            const sizeMb = (sourceFile.size / (1024 * 1024)).toFixed(2);
            setPreviewError(
                `Image is ${sizeMb} MB — the server allows at most ${(MAX_SOURCE_BYTES / (1024 * 1024)).toFixed(0)} MB. Please resize or compress before picking it again.`,
            );
            setPreviewUrl(null);
            setIsPreviewing(false);
            setPreviewProgress(0);

            return;
        }

        if (progressRafRef.current !== null) {
            cancelAnimationFrame(progressRafRef.current);
            progressRafRef.current = null;
        }

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        const startTime = Date.now();
        setIsPreviewing(true);
        setPreviewError(null);
        setPreviewUrl(null);
        setPreviewProgress(0);

        let rafId: number | null = null;
        const tick = (now: number): void => {
            const elapsed = now - startTime;
            const target = Math.min(elapsed / 400, 1);
            const eased = 1 - Math.pow(1 - target, 3);
            setPreviewProgress(eased * 92);

            if (target < 1 && abortRef.current === controller) {
                rafId = requestAnimationFrame(tick);
                progressRafRef.current = rafId;
            }
        };

        rafId = requestAnimationFrame(tick);
        progressRafRef.current = rafId;

        const csrfToken =
            typeof document === 'undefined'
                ? ''
                : (document.querySelector<HTMLMetaElement>(
                      'meta[name="csrf-token"]',
                  )?.content ?? '');

        const formData = new FormData();
        formData.set('source_image', sourceFile);
        formData.set('split_1', split1.toFixed(2));
        formData.set('split_2', split2.toFixed(2));
        formData.set('top_pct', bboxTop.toFixed(2));
        formData.set('bottom_pct', bboxBottom.toFixed(2));
        formData.set('left_pct', bboxLeft.toFixed(2));
        formData.set('right_pct', bboxRight.toFixed(2));
        // Manual label-box fields the controller validator accepts
        // as nullable. Preview endpoint doesn't actually USE these
        // to render the compiled PNG (the rect is overlaid on the
        // source preview here on the surface, not on the compiled
        // preview), but sending them keeps the preview FormData
        // aligned with the commit FormData.
        // Use the clamped labelRect (not the raw label state) so a
        // bbox handle move that overshoots the title slot cannot
        // ferry an invalid label rect to the validator. See the
        // labelRect useMemo above for the clamp logic.
        formData.set('label_left_pct', labelRect.left.toFixed(2));
        formData.set('label_width_pct', labelRect.width.toFixed(2));
        formData.set('label_top_pct', labelRect.top.toFixed(2));
        formData.set('label_height_pct', labelRect.height.toFixed(2));
        // Dynamic content awareness flag — when on, split_2 is
        // auto-set to bboxRight on the controller. The hide-the-end-
        // region semantics live entirely on the client; the
        // controller just needs the flag to skip the
        // "split_2 ≤ rightPct - 1" rule.
        formData.set(
            'dynamic_content_stretch',
            dynamicContentStretch ? '1' : '0',
        );

        try {
            const response = await fetch(
                '/ticker-admin/settings/stitch/preview',
                {
                    method: 'POST',
                    body: formData,
                    headers: {
                        Accept: 'application/json',
                        'X-CSRF-TOKEN': csrfToken,
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                    credentials: 'same-origin',
                    signal: controller.signal,
                },
            );

            if (!response.ok) {
                throw new Error(
                    `preview HTTP ${response.status}: ${await response.text().catch(() => '<empty body>')}`,
                );
            }

            const data = (await response.json()) as {
                preview_base64: string;
            };

            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
                progressRafRef.current = null;
            }

            setPreviewProgress(100);
            setPreviewUrl(`data:image/png;base64,${data.preview_base64}`);
        } catch (caught) {
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
                progressRafRef.current = null;
            }

            if (controller.signal.aborted) {
                return;
            }

            // The thrown Error.message starts with "preview HTTP <code>:
            // <body>" so the body is the only useful payload for the
            // artist when the validator rejects. Laravel's Validation
            // responses are JSON with a `{message, errors: {field:
            // [strings]}}` shape — surface the failing field names
            // instead of a generic "Preview failed" so the artist
            // knows which slider to nudge. The console.error echoes
            // the raw message for devs chasing deeper issues.
            const rawMessage =
                caught instanceof Error ? caught.message : String(caught);
            console.error('Preview request failed:', rawMessage);

            const bodyMatch = rawMessage.match(
                /^preview HTTP \d+:\s*([\s\S]*)$/,
            );
            const body = bodyMatch !== null ? bodyMatch[1].trim() : '';
            let detail = rawMessage;

            try {
                const parsed = JSON.parse(body) as {
                    message?: string;
                    errors?: Record<string, string | string[]>;
                };

                if (
                    parsed.errors !== null &&
                    parsed.errors !== undefined &&
                    typeof parsed.errors === 'object'
                ) {
                    const parts = Object.entries(parsed.errors).map(
                        ([field, messages]) =>
                            `${field}: ${
                                Array.isArray(messages)
                                    ? messages.join(', ')
                                    : String(messages)
                            }`,
                    );

                    if (parts.length > 0) {
                        detail = parts.join(' | ');
                    } else if (typeof parsed.message === 'string') {
                        detail = parsed.message;
                    }

                    // Laravel translates UploadedFile::getError() !=
                    // 0 (PHP rejected the upload — most commonly
                    // because php.ini upload_max_filesize, FPM
                    // post_max_size, or the web server's body limit
                    // sits below the file's bytes) into a "<field>
                    // failed to upload." per-field message. Append a
                    // single actionable hint to `detail` after the
                    // join so it fires whether `detail` was populated
                    // from `parts.join` OR from `parsed.message` —
                    // both signatures match the same source-image
                    // upload-rejection case.
                    if (
                        Object.values(parsed.errors ?? {}).some((messages) =>
                            (Array.isArray(messages)
                                ? messages
                                : [String(messages)]
                            ).some(
                                (m) =>
                                    typeof m === 'string' &&
                                    m.endsWith('failed to upload.'),
                            ),
                        )
                    ) {
                        // Only append the upload-rejection hint when the
                        // JSON branches above actually populated `detail`;
                        // otherwise the hint would glue onto the raw
                        // HTTP string and the artist would see a hybrid.
                        detail +=
                            ' (Server upload limit hit before validation — check php.ini upload_max_filesize and post_max_size, or compress the image.)';
                    }
                }
            } catch {
                // body wasn't JSON; keep the raw HTTP string.
            }

            setPreviewError(detail);
            setPreviewProgress(0);
        } finally {
            if (abortRef.current === controller) {
                setIsPreviewing(false);
            }
        }
    }, [
        sourceFile,
        split1,
        split2,
        bboxLeft,
        bboxRight,
        bboxTop,
        bboxBottom,
        // labelRect is derived from the raw label state + bbox/split
        // — including it as a single dep covers every input that
        // affects the clamped rect (any raw label change OR any bbox
        // change OR split_1 change) without the closure going stale
        // when the user crops the bbox inward.
        labelRect,
        dynamicContentStretch,
        t,
    ]);

    // First preview runs automatically once a source image is chosen.
    // The ref-fresh effect is declared first so React updates
    // requestPreviewRef.current (which is keyed off the latest
    // closures) BEFORE the auto-preview effect reads it.
    useEffect(() => {
        requestPreviewRef.current = requestPreview;
    }, [requestPreview]);

    useEffect(() => {
        if (sourceFile !== null) {
            void requestPreviewRef.current();
        }
    }, [sourceFile]);

    const handleCommit = (): void => {
        if (
            sourceFile === null ||
            themeName.trim() === '' ||
            authorName.trim() === ''
        ) {
            return;
        }

        // Mirror the requestPreview preflight at the commit
        // boundary. The Inertia error bag does surface per-field
        // messages, but only AFTER the request has already
        // dropped the file at PHP and bounced back with 422 —
        // the artist gets a tiny spinner-to-red-flash that's
        // easy to miss. Short-circuiting here means clicking
        // "Slice and apply theme" with an over-cap file shows
        // the same friendly hint as the picker path, so the
        // two flows never disagree about the size envelope.
        if (sourceFile.size > MAX_SOURCE_BYTES) {
            const sizeMb = (sourceFile.size / (1024 * 1024)).toFixed(2);
            setPreviewError(
                `Image is ${sizeMb} MB — the server allows at most ${(MAX_SOURCE_BYTES / (1024 * 1024)).toFixed(0)} MB. Please resize or compress before slicing.`,
            );

            return;
        }

        setIsCommitting(true);
        const formData = new FormData();
        formData.set('source_image', sourceFile);
        formData.set('split_1', split1.toFixed(2));
        formData.set('split_2', split2.toFixed(2));
        formData.set('top_pct', bboxTop.toFixed(2));
        formData.set('bottom_pct', bboxBottom.toFixed(2));
        formData.set('left_pct', bboxLeft.toFixed(2));
        formData.set('right_pct', bboxRight.toFixed(2));
        formData.set('theme_name', themeName);
        formData.set('author_name', authorName);
        // Manual label-box coordinates. Controller fills any subset
        // with bbox-respecting defaults on commit so these fields are
        // effectively always-on for the compile path. We send the
        // user's current values regardless of whether they've moved
        // a handle, so the commit payload captures the full layout.
        // Use the clamped labelRect (not the raw label state) so a
        // bbox handle move that overshoots the title slot cannot
        // ferry an invalid label rect to the validator. See the
        // labelRect useMemo above for the clamp logic.
        formData.set('label_left_pct', labelRect.left.toFixed(2));
        formData.set('label_width_pct', labelRect.width.toFixed(2));
        formData.set('label_top_pct', labelRect.top.toFixed(2));
        formData.set('label_height_pct', labelRect.height.toFixed(2));
        formData.set(
            'dynamic_content_stretch',
            dynamicContentStretch ? '1' : '0',
        );

        router.post('/ticker-admin/settings/stitch', formData, {
            forceFormData: true,
            onFinish: (): void => setIsCommitting(false),
        });
    };

    const dividerLabel = useMemo(
        () =>
            t('cutPositionsLabel', {
                split1: split1.toFixed(1),
                split2: split2.toFixed(1),
            }),
        [split1, split2, t],
    );

    const bboxLabel = useMemo(
        () =>
            t('bboxPositionsLabel', {
                top: bboxTop.toFixed(1),
                bottom: bboxBottom.toFixed(1),
                left: bboxLeft.toFixed(1),
                right: bboxRight.toFixed(1),
            }),
        [bboxTop, bboxBottom, bboxLeft, bboxRight, t],
    );

    const placeholderLabel = useMemo(() => t('previewEmptyState'), [t]);

    // Bbox crops as absolute pixel offsets of the natural image. We
    // compute them off natural dims so the overlay aligns with the
    // photo regardless of how the surface scales to fit the column.
    // Defaults to full-canvas when natural dims are still loading so
    // the overlay never flashes at 100% width / 0% height.
    const cropPx = useMemo(() => {
        if (naturalDims === null) {
            return {
                top: '0%',
                bottom: '100%',
                left: '0%',
                right: '100%',
            };
        }

        return {
            top: `${bboxTop}%`,
            bottom: `${bboxBottom}%`,
            left: `${bboxLeft}%`,
            right: `${bboxRight}%`,
        };
    }, [naturalDims, bboxTop, bboxBottom, bboxLeft, bboxRight]);

    const bboxHasCropped =
        bboxLeft > 0 || bboxRight < 100 || bboxTop > 0 || bboxBottom < 100;

    const croppedTopPct = bboxTop.toFixed(1);
    const croppedBottomPct = (100 - bboxBottom).toFixed(1);
    const croppedLeftPct = bboxLeft.toFixed(1);
    const croppedRightPct = (100 - bboxRight).toFixed(1);

    return (
        <>
            <Head title={t('createTheme')} />
            <div className="flex flex-1 flex-col gap-6 p-4">
                {errors !== null &&
                    errors !== undefined &&
                    Object.keys(errors).length > 0 && (
                        // Banner ALWAYS at the top so a slide-and-apply
                        // commit failure is visible without the artist
                        // having to scroll down to the theme metadata
                        // card. Lists every failing field so the user
                        // sees both the server message AND the field name
                        // — the previous inline-only display buried a
                        // generic `errors.slice` message below the
                        // browser viewport.
                        <Alert variant="destructive">
                            <AlertCircle />
                            <AlertTitle>{t('themeSaveErrorTitle')}</AlertTitle>
                            <AlertDescription>
                                <ul className="list-disc space-y-1 pl-4 text-left">
                                    {Object.entries(errors).map(
                                        ([field, message]) => (
                                            <li key={field}>
                                                <span className="font-mono text-xs">
                                                    {field}:
                                                </span>{' '}
                                                {Array.isArray(message)
                                                    ? message.join(', ')
                                                    : String(message)}
                                            </li>
                                        ),
                                    )}
                                </ul>
                            </AlertDescription>
                        </Alert>
                    )}

                <header className="flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold tracking-normal">
                        {t('createTheme')}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {t('createThemeSingleImageDescription')}
                    </p>
                </header>

                <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                    <div className="space-y-6">
                        <Card className="h-fit rounded-lg">
                            <CardHeader>
                                <CardTitle>{t('sourceImage')}</CardTitle>
                                <CardDescription>
                                    {t('sourceImageDescription')}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {sourceUrl !== null && (
                                    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            disabled={zoom <= ZOOM_MIN}
                                            onClick={zoomOut}
                                            aria-label="Zoom out"
                                        >
                                            <ZoomOut />
                                        </Button>
                                        <span
                                            className="min-w-[3.5rem] text-center font-mono"
                                            aria-live="polite"
                                        >
                                            {Math.round(zoom * 100)}%
                                        </span>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            disabled={zoom >= ZOOM_MAX}
                                            onClick={zoomIn}
                                            aria-label="Zoom in"
                                        >
                                            <ZoomIn />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            disabled={zoom === 1}
                                            onClick={zoomReset}
                                        >
                                            <RotateCcw />
                                            Reset
                                        </Button>
                                        <span className="ml-auto text-muted-foreground">
                                            Cmd/Ctrl +/– · middle-click or
                                            ⌘+drag to pan
                                        </span>
                                    </div>
                                )}
                                <Label htmlFor="source_image">
                                    {t('sourceImage')}
                                </Label>
                                <Input
                                    id="source_image"
                                    type="file"
                                    accept="image/png,image/jpeg,image/jpg"
                                    onChange={(event): void =>
                                        handleFile(
                                            event.target.files?.[0] ?? null,
                                        )
                                    }
                                />
                                <InputError
                                    className="mt-2"
                                    message={errors.source_image}
                                />

                                {sourceUrl !== null && (
                                    <div
                                        ref={surfaceRef}
                                        style={
                                            naturalDims !== null
                                                ? {
                                                      aspectRatio: `${naturalDims.width} / ${naturalDims.height}`,
                                                  }
                                                : undefined
                                        }
                                        onPointerDown={startPan}
                                        onPointerMove={movePan}
                                        onPointerUp={endPan}
                                        onPointerCancel={endPan}
                                        onAuxClick={(event): void =>
                                            event.preventDefault()
                                        }
                                        className={`relative w-full touch-none overflow-hidden rounded-lg border border-border/60 bg-muted/40 select-none${
                                            zoom > 1
                                                ? isPanning
                                                    ? 'cursor-grabbing'
                                                    : 'cursor-grab'
                                                : ''
                                        }`}
                                    >
                                        <div
                                            ref={innerRef}
                                            style={{
                                                width: '100%',
                                                height: '100%',
                                                transform:
                                                    zoom === 1
                                                        ? 'none'
                                                        : `translate(${panX}px, ${panY}px) scale(${zoom})`,
                                                transformOrigin: 'center',
                                            }}
                                        >
                                            <img
                                                src={sourceUrl}
                                                alt={t('sourceImage')}
                                                onLoad={handleImageLoad}
                                                draggable={false}
                                                className="pointer-events-none block max-w-full"
                                            />

                                            {naturalDims !== null &&
                                                bboxHasCropped && (
                                                    // Dimmed bands over the cropped-out
                                                    // areas so the user can see exactly
                                                    // what region survives into the
                                                    // ticker. pointer-events-none keeps
                                                    // the divider drag interaction
                                                    // alive underneath.
                                                    <div
                                                        aria-hidden="true"
                                                        className="pointer-events-none absolute inset-0"
                                                    >
                                                        <div
                                                            className="absolute top-0 right-0 left-0 bg-black/55"
                                                            style={{
                                                                height: cropPx.top,
                                                            }}
                                                        />
                                                        <div
                                                            className="absolute right-0 bottom-0 left-0 bg-black/55"
                                                            style={{
                                                                top: cropPx.bottom,
                                                            }}
                                                        />
                                                        <div
                                                            className="absolute top-0 bottom-0 left-0 bg-black/55"
                                                            style={{
                                                                width: cropPx.left,
                                                            }}
                                                        />
                                                        <div
                                                            className="absolute top-0 right-0 bottom-0 bg-black/55"
                                                            style={{
                                                                left: cropPx.right,
                                                            }}
                                                        />
                                                    </div>
                                                )}

                                            {naturalDims !== null && (
                                                <>
                                                    <EdgeMarker
                                                        orient="vertical"
                                                        percentage={0}
                                                    />
                                                    <EdgeMarker
                                                        orient="vertical"
                                                        percentage={100}
                                                    />
                                                    <EdgeMarker
                                                        orient="horizontal"
                                                        percentage={0}
                                                    />
                                                    <EdgeMarker
                                                        orient="horizontal"
                                                        percentage={100}
                                                    />

                                                    <div
                                                        aria-hidden="true"
                                                        className="pointer-events-none absolute top-3 z-0 truncate text-center"
                                                        style={{
                                                            left: cropPx.left,
                                                            width: `calc(${split1}% - ${cropPx.left})`,
                                                        }}
                                                    >
                                                        <span className="inline-block rounded-full bg-foreground px-2 py-1 text-xs font-semibold text-background shadow-sm">
                                                            {t('sectionTitle')}
                                                        </span>
                                                    </div>
                                                    <div
                                                        aria-hidden="true"
                                                        className="pointer-events-none absolute top-3 z-0 truncate text-center"
                                                        style={{
                                                            left: `${split1}%`,
                                                            width: `${split2 - split1}%`,
                                                        }}
                                                    >
                                                        <span className="inline-block rounded-full bg-foreground px-2 py-1 text-xs font-semibold text-background shadow-sm">
                                                            {t(
                                                                'sectionContent',
                                                            )}
                                                        </span>
                                                    </div>
                                                    {bboxRight - split2 >
                                                        0.5 && (
                                                        <div
                                                            aria-hidden="true"
                                                            className="pointer-events-none absolute top-3 z-0 truncate text-center"
                                                            style={{
                                                                left: `${split2}%`,
                                                                width: `${Math.max(0, bboxRight - split2)}%`,
                                                            }}
                                                        >
                                                            <span className="inline-block rounded-full bg-foreground px-2 py-1 text-xs font-semibold text-background shadow-sm">
                                                                {t(
                                                                    'sectionEnd',
                                                                )}
                                                            </span>
                                                        </div>
                                                    )}

                                                    <VerticalHandle
                                                        which="left"
                                                        percentage={bboxLeft}
                                                        start={startVerticalDrag(
                                                            'left',
                                                        )}
                                                        move={moveVerticalDrag}
                                                        end={endDrag}
                                                        keyDrag={keyVerticalDrag(
                                                            'left',
                                                        )}
                                                    />
                                                    <VerticalHandle
                                                        which="split1"
                                                        percentage={split1}
                                                        start={startVerticalDrag(
                                                            'split1',
                                                        )}
                                                        move={moveVerticalDrag}
                                                        end={endDrag}
                                                        keyDrag={keyVerticalDrag(
                                                            'split1',
                                                        )}
                                                    />
                                                    <VerticalHandle
                                                        which="split2"
                                                        percentage={split2}
                                                        start={startVerticalDrag(
                                                            'split2',
                                                        )}
                                                        move={moveVerticalDrag}
                                                        end={endDrag}
                                                        keyDrag={keyVerticalDrag(
                                                            'split2',
                                                        )}
                                                    />
                                                    <VerticalHandle
                                                        which="right"
                                                        percentage={bboxRight}
                                                        start={startVerticalDrag(
                                                            'right',
                                                        )}
                                                        move={moveVerticalDrag}
                                                        end={endDrag}
                                                        keyDrag={keyVerticalDrag(
                                                            'right',
                                                        )}
                                                    />

                                                    <HorizontalHandle
                                                        which="top"
                                                        percentage={bboxTop}
                                                        start={startHorizontalDrag(
                                                            'top',
                                                        )}
                                                        move={
                                                            moveHorizontalDrag
                                                        }
                                                        end={endDrag}
                                                        keyDrag={keyHorizontalDrag(
                                                            'top',
                                                        )}
                                                    />
                                                    <HorizontalHandle
                                                        which="bottom"
                                                        percentage={bboxBottom}
                                                        start={startHorizontalDrag(
                                                            'bottom',
                                                        )}
                                                        move={
                                                            moveHorizontalDrag
                                                        }
                                                        end={endDrag}
                                                        keyDrag={keyHorizontalDrag(
                                                            'bottom',
                                                        )}
                                                    />

                                                    {/* Manual label box.
                                                    Sits above the bbox
                                                    dimming bands but below
                                                    the four edge handles so
                                                    the rect itself stays as
                                                    a translucent marker
                                                    rather than blocking the
                                                    pointer. Coordinates come
                                                    from the clamped labelRect
                                                    above so the visible rect
                                                    is always inside both the
                                                    title slot horizontally
                                                    and the bbox vertically,
                                                    no matter how the artist
                                                    dragged the handles. */}
                                                    <div
                                                        aria-hidden="true"
                                                        className="pointer-events-none absolute z-[1] rounded-sm border-2 border-rose-400/85 bg-rose-400/10"
                                                        style={{
                                                            left: `${labelRect.left}%`,
                                                            top: `${labelRect.top}%`,
                                                            width: `${labelRect.width}%`,
                                                            height: `${labelRect.height}%`,
                                                        }}
                                                    />
                                                    <LabelEdgeHandle
                                                        which="left"
                                                        percentageX={
                                                            labelRect.left
                                                        }
                                                        percentageY={
                                                            labelRect.top +
                                                            labelRect.height / 2
                                                        }
                                                        start={startLabelVerticalDrag(
                                                            'left',
                                                        )}
                                                        move={
                                                            moveLabelVerticalDrag
                                                        }
                                                        end={endDrag}
                                                        keyDrag={keyLabelDrag(
                                                            'left',
                                                        )}
                                                    />
                                                    <LabelEdgeHandle
                                                        which="right"
                                                        percentageX={
                                                            labelRect.left +
                                                            labelRect.width
                                                        }
                                                        percentageY={
                                                            labelRect.top +
                                                            labelRect.height / 2
                                                        }
                                                        start={startLabelVerticalDrag(
                                                            'right',
                                                        )}
                                                        move={
                                                            moveLabelVerticalDrag
                                                        }
                                                        end={endDrag}
                                                        keyDrag={keyLabelDrag(
                                                            'right',
                                                        )}
                                                    />
                                                    <LabelEdgeHandle
                                                        which="top"
                                                        percentageX={
                                                            labelRect.left +
                                                            labelRect.width / 2
                                                        }
                                                        percentageY={
                                                            labelRect.top
                                                        }
                                                        start={startLabelHorizontalDrag(
                                                            'top',
                                                        )}
                                                        move={
                                                            moveLabelHorizontalDrag
                                                        }
                                                        end={endDrag}
                                                        keyDrag={keyLabelDrag(
                                                            'top',
                                                        )}
                                                    />
                                                    <LabelEdgeHandle
                                                        which="bottom"
                                                        percentageX={
                                                            labelRect.left +
                                                            labelRect.width / 2
                                                        }
                                                        percentageY={
                                                            labelRect.top +
                                                            labelRect.height
                                                        }
                                                        start={startLabelHorizontalDrag(
                                                            'bottom',
                                                        )}
                                                        move={
                                                            moveLabelHorizontalDrag
                                                        }
                                                        end={endDrag}
                                                        keyDrag={keyLabelDrag(
                                                            'bottom',
                                                        )}
                                                    />
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {sourceUrl !== null && (
                                    <div className="space-y-1">
                                        <p className="text-sm text-muted-foreground">
                                            {dividerLabel}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            {bboxLabel}
                                        </p>
                                        {naturalDims !== null && (
                                            <div className="flex flex-col gap-0.5 text-xs text-muted-foreground/80">
                                                <p>{t('bboxKeyboardHintV')}</p>
                                                <p>{t('bboxKeyboardHintH')}</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="h-fit rounded-lg">
                            <CardHeader>
                                <CardTitle>{t('themePreview')}</CardTitle>
                                <CardDescription>
                                    {t('themePreviewSingleImageDescription')}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {previewError !== null && (
                                    <Alert variant="destructive">
                                        <AlertCircle />
                                        <AlertTitle>
                                            {t('previewFailed')}
                                        </AlertTitle>
                                        <AlertDescription>
                                            {previewError}
                                        </AlertDescription>
                                    </Alert>
                                )}

                                {previewUrl !== null && (
                                    <div className="aspect-[4/1] w-full overflow-hidden rounded-lg border border-border/60 bg-muted/30">
                                        <img
                                            src={previewUrl}
                                            alt={t('themePreview')}
                                            className="bg-checker block h-full w-full object-contain"
                                        />
                                    </div>
                                )}

                                {!isPreviewing &&
                                    previewUrl === null &&
                                    previewError === null && (
                                        <div className="flex items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                                            <ImageIcon className="size-4 shrink-0" />
                                            <span>{placeholderLabel}</span>
                                        </div>
                                    )}

                                <div className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            disabled={
                                                sourceFile === null ||
                                                isPreviewing
                                            }
                                            onClick={(): void => {
                                                void requestPreview();
                                            }}
                                        >
                                            {isPreviewing ? (
                                                <Spinner className="size-4" />
                                            ) : (
                                                <Eye />
                                            )}
                                            {isPreviewing
                                                ? t('previewPending')
                                                : t('previewTheme')}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            disabled={
                                                sourceFile === null ||
                                                isPreviewing ||
                                                !bboxHasCropped
                                            }
                                            onClick={handleResetBbox}
                                        >
                                            <RotateCcw />
                                            {t('bboxReset')}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            disabled={sourceFile === null}
                                            onClick={handleResetLabel}
                                        >
                                            <RotateCcw />
                                            {t('labelReset')}
                                        </Button>
                                    </div>
                                    {isPreviewing && (
                                        <div className="flex items-center gap-3">
                                            <Progress
                                                value={Math.round(
                                                    previewProgress,
                                                )}
                                                aria-label={t('previewPending')}
                                                className="flex-1"
                                            />
                                            <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                                                {Math.round(previewProgress)}%
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="space-y-6">
                        <Card className="h-fit rounded-lg">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Crop className="size-4" />
                                    {t('bboxTitle')}
                                </CardTitle>
                                <CardDescription>
                                    {t('bboxTitleDescription')}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm">
                                <label className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                                    <input
                                        type="hidden"
                                        name="dynamic_content_stretch"
                                        value="0"
                                    />
                                    <Checkbox
                                        checked={dynamicContentStretch}
                                        onCheckedChange={(checked): void =>
                                            setDynamicContentStretch(
                                                checked === true,
                                            )
                                        }
                                    />
                                    <span>
                                        <span className="font-medium">
                                            Dynamic content awareness
                                        </span>
                                        <span className="mt-1 block text-xs text-muted-foreground">
                                            When on, the content slot may extend
                                            all the way to the bounding-box
                                            edge. Move the cut slider to
                                            fine-tune how much the content
                                            stretches.
                                        </span>
                                    </span>
                                </label>

                                {bboxHasCropped ? (
                                    <ul className="space-y-1">
                                        {bboxTop > 0 && (
                                            <li className="flex justify-between text-muted-foreground">
                                                <span>
                                                    {t('bboxBandTop', {
                                                        pct: croppedTopPct,
                                                    })}
                                                </span>
                                                <span className="font-mono tabular-nums">
                                                    {croppedTopPct}%
                                                </span>
                                            </li>
                                        )}
                                        {bboxBottom < 100 && (
                                            <li className="flex justify-between text-muted-foreground">
                                                <span>
                                                    {t('bboxBandBottom', {
                                                        pct: croppedBottomPct,
                                                    })}
                                                </span>
                                                <span className="font-mono tabular-nums">
                                                    {croppedBottomPct}%
                                                </span>
                                            </li>
                                        )}
                                        {bboxLeft > 0 && (
                                            <li className="flex justify-between text-muted-foreground">
                                                <span>
                                                    {t('bboxBandLeft', {
                                                        pct: croppedLeftPct,
                                                    })}
                                                </span>
                                                <span className="font-mono tabular-nums">
                                                    {croppedLeftPct}%
                                                </span>
                                            </li>
                                        )}
                                        {bboxRight < 100 && (
                                            <li className="flex justify-between text-muted-foreground">
                                                <span>
                                                    {t('bboxBandRight', {
                                                        pct: croppedRightPct,
                                                    })}
                                                </span>
                                                <span className="font-mono tabular-nums">
                                                    {croppedRightPct}%
                                                </span>
                                            </li>
                                        )}
                                    </ul>
                                ) : (
                                    <p className="text-muted-foreground">
                                        No crop applied — the full source image
                                        feeds the ticker.
                                    </p>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="h-fit rounded-lg">
                            <CardHeader>
                                <CardTitle>{t('themeMetadata')}</CardTitle>
                                <CardDescription>
                                    {t('themeMetadataDescription')}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <Label htmlFor="theme_name">
                                        {t('themeName')}
                                    </Label>
                                    <Input
                                        id="theme_name"
                                        type="text"
                                        value={themeName}
                                        onChange={(event): void =>
                                            setThemeName(event.target.value)
                                        }
                                        placeholder="scoreboard-dark"
                                        required
                                        className="mt-1"
                                    />
                                    <InputError
                                        className="mt-2"
                                        message={errors.theme_name}
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="author_name">
                                        {t('authorName')}
                                    </Label>
                                    <Input
                                        id="author_name"
                                        type="text"
                                        value={authorName}
                                        onChange={(event): void =>
                                            setAuthorName(event.target.value)
                                        }
                                        placeholder="Patrik Forsberg"
                                        required
                                        className="mt-1"
                                    />
                                    <InputError
                                        className="mt-2"
                                        message={errors.author_name}
                                    />
                                </div>
                                <InputError message={errors.slice} />
                            </CardContent>
                        </Card>

                        <Card>
                            <CardContent className="flex flex-col gap-3 pt-6">
                                <Button
                                    type="button"
                                    disabled={
                                        isCommitting ||
                                        sourceFile === null ||
                                        themeName.trim() === '' ||
                                        authorName.trim() === ''
                                    }
                                    onClick={handleCommit}
                                >
                                    {isCommitting ? (
                                        <Spinner className="size-4" />
                                    ) : (
                                        <Scissors />
                                    )}
                                    {isCommitting
                                        ? t('committingTheme')
                                        : t('sliceAndApplyTheme')}
                                </Button>
                                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                                    <Spline className="mt-0.5 size-3 shrink-0" />
                                    <span>{t('commitHint')}</span>
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </>
    );
}

type VerticalHandleProps = {
    which: VerticalHandle;
    percentage: number;
    start: (event: ReactPointerEvent<HTMLDivElement>) => void;
    move: (event: ReactPointerEvent<HTMLDivElement>) => void;
    end: (event: ReactPointerEvent<HTMLDivElement>) => void;
    keyDrag: (event: React.KeyboardEvent<HTMLDivElement>) => void;
};

type HorizontalHandleProps = {
    which: HorizontalHandle;
    percentage: number;
    start: (event: ReactPointerEvent<HTMLDivElement>) => void;
    move: (event: ReactPointerEvent<HTMLDivElement>) => void;
    end: (event: ReactPointerEvent<HTMLDivElement>) => void;
    keyDrag: (event: React.KeyboardEvent<HTMLDivElement>) => void;
};

type LabelEdgeHandleProps = {
    which: LabelEdge;
    // Both axes are absolute source-percent coordinates so the
    // component positions itself at the exact edge-midpoint of the
    // label rect. The vertical/horizontal split is encoded by the
    // `which` value, not by separate props.
    percentageX: number;
    percentageY: number;
    start: (event: ReactPointerEvent<HTMLDivElement>) => void;
    move: (event: ReactPointerEvent<HTMLDivElement>) => void;
    end: (event: ReactPointerEvent<HTMLDivElement>) => void;
    keyDrag: (event: React.KeyboardEvent<HTMLDivElement>) => void;
};

type EdgeMarkerProps = {
    orient: 'vertical' | 'horizontal';
    percentage: number;
};

// A single draggable vertical handle. Renders a slim colored line
// with a percentage badge that hides on drag so the cursor always
// sits on empty visual real estate while positioning the cut.
function VerticalHandle({
    which,
    percentage,
    start,
    move,
    end,
    keyDrag,
}: VerticalHandleProps) {
    const ariaLabel =
        which === 'left'
            ? 'Bounding box left'
            : which === 'right'
              ? 'Bounding box right'
              : `Cut ${which === 'split1' ? '1' : '2'}`;

    return (
        <div
            role="slider"
            aria-orientation="vertical"
            aria-label={ariaLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percentage * 10) / 10}
            aria-valuetext={`${percentage.toFixed(1)} percent`}
            tabIndex={0}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onKeyDown={keyDrag}
            style={{ left: `${percentage}%` }}
            className="group absolute top-0 z-10 flex h-full w-6 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center rounded-sm outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
        >
            <HandleColor which={which} />
            <HandleBadge label={`${percentage.toFixed(1)}%`} position="right" />
        </div>
    );
}

// Label-box edge handle. Each edge sits at the midpoint of its
// edge (e.g. left = (labelLeft, labelTop + labelHeight/2)), rendered
// as a small rose-tinted grab dot. Visually distinct from the bbox
// handles (amber) and cut dividers (foreground) so the user can tell
// which control they're about to grab without inspecting the
// position. Uses left+top for both axes so a single dot represents
// the edge intersection no matter how the rect is sized.
function LabelEdgeHandle({
    which,
    percentageX,
    percentageY,
    start,
    move,
    end,
    keyDrag,
}: LabelEdgeHandleProps) {
    const isVertical = which === 'left' || which === 'right';
    const ariaLabel = `Label box ${which} edge`;
    const cursorClass = isVertical ? 'cursor-ew-resize' : 'cursor-ns-resize';
    const valueForAria = isVertical ? percentageX : percentageY;

    return (
        <div
            role="slider"
            aria-orientation={isVertical ? 'vertical' : 'horizontal'}
            aria-label={ariaLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(valueForAria * 10) / 10}
            aria-valuetext={`${valueForAria.toFixed(1)} percent`}
            tabIndex={0}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onKeyDown={keyDrag}
            style={{
                left: `${percentageX}%`,
                top: `${percentageY}%`,
            }}
            className={`absolute z-[2] flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-md border-2 border-rose-400 bg-background/85 text-[10px] font-bold text-rose-500 shadow-sm transition-shadow outline-none select-none ${cursorClass} hover:bg-rose-50 hover:shadow-md focus-visible:ring-2 focus-visible:ring-rose-400`}
        >
            <span aria-hidden="true">{isVertical ? '↔' : '↕'}</span>
        </div>
    );
}

function HorizontalHandle({
    which,
    percentage,
    start,
    move,
    end,
    keyDrag,
}: HorizontalHandleProps) {
    const ariaLabel =
        which === 'top' ? 'Bounding box top' : 'Bounding box bottom';

    return (
        <div
            role="slider"
            aria-orientation="horizontal"
            aria-label={ariaLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percentage * 10) / 10}
            aria-valuetext={`${percentage.toFixed(1)} percent`}
            tabIndex={0}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onKeyDown={keyDrag}
            style={{ top: `${percentage}%` }}
            className="group absolute right-0 left-0 z-10 flex h-6 -translate-y-1/2 cursor-ns-resize touch-none items-center justify-center rounded-sm outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
        >
            <HandleColor which={which} />
            <HandleBadge
                label={`${percentage.toFixed(1)}%`}
                position="bottom"
            />
        </div>
    );
}

// Shared color logic so the vertical bbox edges render in a calmer
// hue and the cut dividers keep the vivid primary that signals
// "this is the cut you'll see on the ticker".
function HandleColor({ which }: { which: VerticalHandle | HorizontalHandle }) {
    if (which === 'split1' || which === 'split2') {
        return (
            <div className="h-full w-0.5 bg-foreground/80 shadow-[0_0_0_1px_rgba(0,0,0,0.35)] transition-colors group-hover:bg-primary group-focus-visible:bg-primary group-active:bg-primary" />
        );
    }

    return (
        <div className="h-full w-0.5 bg-amber-500/80 shadow-[0_0_0_1px_rgba(0,0,0,0.25)] transition-colors group-hover:bg-amber-400 group-focus-visible:bg-amber-400 group-active:bg-amber-300" />
    );
}

// Tooltip-style badge that displays the handle's current percentage.
// Position prop mirrors the orientation so vertical handles show the
// value to the right of the line and horizontal handles show it
// below — both centre-aligned with the slider for readability.
function HandleBadge({
    label,
    position,
}: {
    label: string;
    position: 'right' | 'bottom';
}) {
    const placement =
        position === 'right'
            ? 'left-1/2 -translate-x-1/2 top-2'
            : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 mt-6';

    return (
        <div
            aria-hidden="true"
            className={`pointer-events-none absolute ${placement} rounded-md bg-foreground px-2 py-0.5 text-[10px] font-semibold text-background tabular-nums shadow-sm`}
        >
            {label}
        </div>
    );
}

/**
 * Decorative boundary marker at the canvas's edge (0% or 100% of an
 * axis). Sits underneath the handles in both z-index and visual
 * weight — no grab cursor, no focus ring, no keyboard handler. The
 * bbox handles already publish the boundary positions through
 * `role="slider"`. Stripes are heavier than the 1px soft variant
 * the previous iteration shipped so they remain visible across the
 * muted surface.
 */
function EdgeMarker({ orient, percentage }: EdgeMarkerProps) {
    if (orient === 'vertical') {
        return (
            <div
                aria-hidden="true"
                style={{
                    left: `${percentage}%`,
                    marginLeft: '-1.5px',
                    width: '3px',
                }}
                className="pointer-events-none absolute top-0 z-0 h-full bg-foreground shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
            />
        );
    }

    return (
        <div
            aria-hidden="true"
            style={{
                top: `${percentage}%`,
                marginTop: '-1.5px',
                height: '3px',
            }}
            className="pointer-events-none absolute right-0 left-0 z-0 bg-foreground shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
        />
    );
}
