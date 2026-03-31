import { useState, useEffect } from 'react';
import { type PopupContent } from '@/types/popup';

interface InfoPopupProps {
    content: PopupContent;
    onClose: () => void;
    onFollow?: (id: string | null) => void;
    isFollowing?: boolean;
}

export function InfoPopup({ content, onClose, onFollow, isFollowing }: InfoPopupProps) {
    const [data, setData] = useState(content);
    const [imgError, setImgError] = useState(false);
    const [imgLoaded, setImgLoaded] = useState(false);
    const [lightbox, setLightbox] = useState(false);
    const [enriching, setEnriching] = useState(false);
    const [pinging, setPinging] = useState(false);

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
        const pingTimer = setTimeout(() => setPinging(false), 700);

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

    return (
        <>
            <div className={`absolute top-6 right-6 z-20 ${isLarge ? 'w-[28rem]' : 'w-80'}`}>
                <div
                    className="bg-[var(--bg-ui)] backdrop-blur-md border rounded-xl overflow-hidden shadow-2xl"
                    style={{
                        borderColor: data.color ?? 'var(--accent-blue)',
                        borderWidth: '1px',
                        boxShadow: pinging
                            ? `0 0 24px 4px ${data.color ?? 'var(--accent-blue)'}, 0 25px 50px -12px rgb(0 0 0 / 0.25)`
                            : '0 25px 50px -12px rgb(0 0 0 / 0.25)',
                        transition: 'box-shadow 0.7s ease-out',
                    }}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                        <div className="flex items-center gap-2 min-w-0">
                            {data.icon && <span className="text-lg shrink-0">{data.icon}</span>}
                            <h3
                                className="font-mono text-sm font-semibold truncate"
                                style={{ color: data.color ?? 'var(--accent-blue)' }}
                            >
                                {data.title}
                            </h3>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors ml-2 shrink-0 cursor-pointer"
                        >
                            ✕
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
                    <div className="px-4 py-3 flex flex-col gap-2">
                        {data.fields.map((field) => (
                            <div key={field.label} className="flex justify-between items-baseline">
                                <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">
                                    {field.label}
                                </span>
                                <span className="font-mono text-sm text-[var(--text-primary)]">
                                    {field.value}
                                    {field.unit && (
                                        <span className="text-[var(--text-muted)] ml-1 text-xs">
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
                                className="block w-full text-center py-2 rounded-lg text-sm font-mono transition-colors"
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
                                className="block w-full text-center py-2 rounded-lg text-sm font-mono transition-colors cursor-pointer"
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
