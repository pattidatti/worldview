import { useState } from 'react';
import { type PopupContent } from '@/types/popup';

interface InfoPopupProps {
    content: PopupContent;
    onClose: () => void;
}

export function InfoPopup({ content, onClose }: InfoPopupProps) {
    const [imgError, setImgError] = useState(false);
    const [imgLoaded, setImgLoaded] = useState(false);

    return (
        <div className="absolute top-6 right-6 z-20 w-80">
            <div
                className="bg-[var(--bg-ui)] backdrop-blur-md border rounded-xl overflow-hidden shadow-2xl"
                style={{ borderColor: content.color ?? 'var(--accent-blue)', borderWidth: '1px' }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                    <div className="flex items-center gap-2 min-w-0">
                        {content.icon && <span className="text-lg shrink-0">{content.icon}</span>}
                        <h3
                            className="font-mono text-sm font-semibold truncate"
                            style={{ color: content.color ?? 'var(--accent-blue)' }}
                        >
                            {content.title}
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
                {content.imageUrl && !imgError && (
                    <div className="relative bg-black/30">
                        {!imgLoaded && (
                            <div className="flex items-center justify-center h-40 text-[var(--text-muted)] text-sm animate-pulse">
                                Laster bilde...
                            </div>
                        )}
                        <a href={content.linkUrl ?? content.imageUrl} target="_blank" rel="noopener noreferrer">
                            <img
                                src={content.imageUrl}
                                alt={content.title}
                                className={`w-full object-cover cursor-pointer hover:opacity-90 transition-opacity ${imgLoaded ? '' : 'h-0'}`}
                                style={{ maxHeight: '200px' }}
                                onLoad={() => setImgLoaded(true)}
                                onError={() => setImgError(true)}
                            />
                        </a>
                    </div>
                )}

                {/* Fields */}
                <div className="px-4 py-3 flex flex-col gap-2">
                    {content.fields.map((field) => (
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
                {content.linkUrl && (
                    <div className="px-4 pb-3">
                        <a
                            href={content.linkUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block w-full text-center py-2 rounded-lg text-sm font-mono transition-colors"
                            style={{
                                backgroundColor: `${content.color ?? 'var(--accent-blue)'}20`,
                                color: content.color ?? 'var(--accent-blue)',
                            }}
                        >
                            {content.linkLabel ?? 'Åpne'}
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
}
