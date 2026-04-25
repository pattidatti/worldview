import { useState, useEffect, useRef } from 'react';
import { type PopupContent } from '@/types/popup';

interface InfoPopupProps {
    content: PopupContent;
    onClose: () => void;
    onFollow?: (id: string | null) => void;
    isFollowing?: boolean;
    originPos?: { x: number; y: number } | null;
}

export function InfoPopup({ content, onClose, onFollow, isFollowing, originPos }: InfoPopupProps) {
    const [data, setData] = useState(content);
    const [imgError, setImgError] = useState(false);
    const [imgLoaded, setImgLoaded] = useState(false);
    const [lightbox, setLightbox] = useState(false);
    const [enriching, setEnriching] = useState(false);
    const [pinging, setPinging] = useState(false);
    const [animKey, setAnimKey] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    const isLarge = data.imageSize === 'large';

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    // Reset state and trigger enrichment when content changes
    useEffect(() => {
        setData(content);
        setImgError(false);
        setImgLoaded(false);
        setLightbox(false);
        setPinging(true);
        setAnimKey((k) => k + 1);
        const pingTimer = setTimeout(() => setPinging(false), 700);

        // Beregn entry-animasjon fra entity-skjermposisjon
        if (originPos && containerRef.current) {
            const panelX = window.innerWidth - 16 - (isLarge ? 224 : 160);
            const panelY = 72;
            const dx = originPos.x - panelX;
            const dy = originPos.y - panelY;
            containerRef.current.style.setProperty('--entry-dx', `${dx}px`);
            containerRef.current.style.setProperty('--entry-dy', `${dy}px`);
        }

        let cancelled = false;
        if (content.enrichAsync) {
            setEnriching(true);
            content.enrichAsync().then((extra) => {
                if (!cancelled) {
                    setData((prev) => ({ ...prev, ...extra, enrichAsync: undefined }));
                    setEnriching(false);
                }
            }).catch(() => { if (!cancelled) setEnriching(false); });
        }

        return () => {
            cancelled = true;
            clearTimeout(pingTimer);
        };
    }, [content]);

    const color = data.color ?? 'var(--accent-blue)';

    return (
        <>
            <div
                key={animKey}
                ref={containerRef}
                className={`absolute top-14 z-20 ${isLarge ? 'w-[28rem]' : 'w-80'} ${originPos ? 'animate-holo-entry' : 'animate-fade-in-up'}`}
                style={{
                    right: '1rem',
                    maxHeight: 'calc(100vh - 6rem)',
                    overflowY: 'auto',
                }}
            >
                <div
                    className="relative bg-[var(--bg-ui)] backdrop-blur-xl border rounded-2xl overflow-hidden"
                    style={{
                        borderColor: color,
                        borderWidth: '1px',
                        boxShadow: pinging
                            ? `0 0 0 1px ${color}50, 0 0 32px 8px ${color}20, 0 0 12px 2px ${color}30, var(--shadow-panel)`
                            : `0 0 0 1px ${color}25, 0 0 12px 2px ${color}15, var(--shadow-panel)`,
                        transition: 'box-shadow 0.7s ease-out',
                    }}
                >
                    {/* Holografisk scanline-overlay */}
                    <div
                        className="absolute inset-0 pointer-events-none rounded-2xl"
                        style={{
                            background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,200,255,0.018) 3px, rgba(0,200,255,0.018) 4px)',
                            zIndex: 1,
                        }}
                    />
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07]">
                        <div className="flex items-center gap-2 min-w-0">
                            {data.icon && <span className="text-base shrink-0">{data.icon}</span>}
                            <h3 className="font-sans text-sm font-semibold truncate text-white">
                                {data.title}
                            </h3>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-6 h-6 rounded-full flex items-center justify-center ml-3 shrink-0 cursor-pointer transition-all hover:bg-white/10"
                            style={{ color: 'var(--text-muted)' }}
                        >
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                                <path d="M1.5 1.5l7 7M8.5 1.5l-7 7"/>
                            </svg>
                        </button>
                    </div>

                    {/* Image */}
                    {data.imageUrl && !imgError && (
                        <div className="relative bg-black/30">
                            {!imgLoaded && (
                                <div className="flex items-center justify-center h-40 text-[var(--text-muted)] text-sm animate-pulse">
                                    Laster bilde...
                                </div>
                            )}
                            <button
                                onClick={() => isLarge ? setLightbox(true) : window.open(data.imageUrl, '_blank')}
                                className="w-full cursor-pointer"
                            >
                                <img
                                    src={data.imageUrl}
                                    alt={data.title}
                                    className={`w-full object-cover hover:opacity-90 transition-opacity ${imgLoaded ? '' : 'h-0'}`}
                                    style={{ maxHeight: isLarge ? '400px' : '200px' }}
                                    onLoad={() => setImgLoaded(true)}
                                    onError={() => setImgError(true)}
                                />
                            </button>
                            {isLarge && imgLoaded && (
                                <div className="absolute bottom-2 right-2 bg-black/50 backdrop-blur-sm rounded px-2 py-1 text-[var(--text-muted)] text-xs pointer-events-none">
                                    Klikk for å forstørre
                                </div>
                            )}
                        </div>
                    )}

                    {/* Description */}
                    {data.description && (
                        <div className="px-4 pt-3">
                            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                                {data.description}
                            </p>
                        </div>
                    )}

                    {/* Enriching indicator */}
                    {enriching && (
                        <div className="px-4 pt-2">
                            <div className="h-1 w-full bg-white/5 rounded overflow-hidden">
                                <div className="h-full w-1/3 rounded animate-[shimmer_1s_ease-in-out_infinite]"
                                     style={{ backgroundColor: `${data.color ?? 'var(--accent-blue)'}40` }} />
                            </div>
                        </div>
                    )}

                    {/* Fields */}
                    <div className="px-4 py-2 flex flex-col divide-y divide-white/5">
                        {data.fields.map((field) => (
                            <div key={field.label} className="flex justify-between items-baseline py-1.5 first:pt-0 last:pb-0">
                                <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-sans">
                                    {field.label}
                                </span>
                                <span className="font-mono text-xs text-[var(--text-primary)] ml-4">
                                    {field.value}
                                    {field.unit && (
                                        <span className="text-[var(--text-muted)] ml-1 text-[10px]">
                                            {field.unit}
                                        </span>
                                    )}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Link button */}
                    {data.linkUrl && (
                        <div className="px-4 pb-3">
                            <a
                                href={data.linkUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block w-full text-center py-2.5 rounded-xl text-xs font-sans transition-colors hover:opacity-80"
                                style={{
                                    backgroundColor: `${data.color ?? 'var(--accent-blue)'}20`,
                                    color: data.color ?? 'var(--accent-blue)',
                                }}
                            >
                                {data.linkLabel ?? 'Åpne'}
                            </a>
                        </div>
                    )}

                    {/* Follow button */}
                    {data.followEntityId && onFollow && (
                        <div className={`px-4 ${data.linkUrl ? 'pt-0' : ''} pb-3`}>
                            <button
                                onClick={() => onFollow(isFollowing ? null : data.followEntityId!)}
                                className="block w-full text-center py-2.5 rounded-xl text-xs font-sans transition-colors cursor-pointer hover:opacity-80"
                                style={{
                                    backgroundColor: isFollowing
                                        ? `${data.color ?? 'var(--accent-blue)'}40`
                                        : `${data.color ?? 'var(--accent-blue)'}15`,
                                    color: data.color ?? 'var(--accent-blue)',
                                    border: isFollowing ? `1px solid ${data.color ?? 'var(--accent-blue)'}60` : '1px solid transparent',
                                }}
                            >
                                {isFollowing ? '⏹ Slutter å følge' : '▶ Følg'}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Lightbox */}
            {lightbox && data.imageUrl && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-pointer animate-[fade-in_200ms_ease-out]"
                    onClick={() => setLightbox(false)}
                >
                    <div className="relative max-w-[90vw] max-h-[90vh]">
                        <img
                            src={data.imageUrl}
                            alt={data.title}
                            className="w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
                        />
                        <div className="absolute bottom-4 left-0 right-0 text-center">
                            <span className="bg-black/60 backdrop-blur-sm text-white text-sm font-mono px-4 py-2 rounded-lg">
                                {data.title}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
