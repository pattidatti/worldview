import { useEffect, useState } from 'react';
import type { HeritageMonument } from '@/types/heritage';

interface HeritagePopupProps {
    monument: HeritageMonument;
    onStartTour: () => void;
}

/**
 * 2D-sammendragspanel som dukker opp når kameraet nærmer seg et verdens-arv-monument.
 * Plassert nede til venstre — unngår kollisjon med InfoPopup (top-right) og GatePanel (top-right).
 */
export function HeritagePopup({ monument, onStartTour }: HeritagePopupProps) {
    const [imgError, setImgError] = useState(false);
    const [imgLoaded, setImgLoaded] = useState(false);
    const [animKey, setAnimKey] = useState(0);

    // Reset bilde-state og trigger re-animasjon når monumentet endres
    useEffect(() => {
        setImgError(false);
        setImgLoaded(false);
        setAnimKey((k) => k + 1);
    }, [monument.id]);

    const color = monument.glowColor;

    return (
        <div
            key={animKey}
            className="absolute bottom-24 left-4 z-20 w-80 animate-fade-in-up"
            style={{ maxHeight: 'calc(100vh - 12rem)', overflowY: 'auto' }}
        >
            <div
                className="relative bg-[var(--bg-ui)] backdrop-blur-xl border rounded-2xl overflow-hidden"
                style={{
                    borderColor: color,
                    borderWidth: '1px',
                    boxShadow: `0 0 0 1px ${color}30, 0 0 20px 4px ${color}25, var(--shadow-panel)`,
                }}
            >
                {/* Scanline-overlay for holografisk look */}
                <div
                    className="absolute inset-0 pointer-events-none rounded-2xl"
                    style={{
                        background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,215,0,0.02) 3px, rgba(255,215,0,0.02) 4px)',
                        zIndex: 1,
                    }}
                />

                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07]">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base shrink-0" aria-hidden>𓉘</span>
                        <h3 className="font-sans text-sm font-semibold truncate text-white">
                            {monument.name}
                        </h3>
                    </div>
                    <span
                        className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full ml-3 shrink-0"
                        style={{ color, backgroundColor: `${color}15`, border: `1px solid ${color}40` }}
                    >
                        Verdens-arv
                    </span>
                </div>

                {/* Bilde */}
                {monument.imageUrl && !imgError && (
                    <div className="relative bg-black/30">
                        {!imgLoaded && (
                            <div className="flex items-center justify-center h-40 text-[var(--text-muted)] text-sm animate-pulse">
                                Laster bilde...
                            </div>
                        )}
                        <img
                            src={monument.imageUrl}
                            alt={monument.name}
                            className={`w-full object-cover ${imgLoaded ? '' : 'h-0'}`}
                            style={{ maxHeight: '180px' }}
                            onLoad={() => setImgLoaded(true)}
                            onError={() => setImgError(true)}
                        />
                    </div>
                )}

                {/* Sammendrag */}
                <div className="px-4 pt-3">
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                        {monument.summary}
                    </p>
                </div>

                {/* Wow-fakta */}
                {monument.wowFact && (
                    <div className="px-4 pt-2">
                        <p className="text-xs italic" style={{ color }}>
                            ✦ {monument.wowFact}
                        </p>
                    </div>
                )}

                {/* Fakta-felter */}
                <div className="px-4 py-2 mt-1 flex flex-col divide-y divide-white/5">
                    {monument.facts.map((field) => (
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

                {/* Tour-knapp */}
                <div className="px-4 pb-3 pt-1">
                    <button
                        onClick={onStartTour}
                        className="block w-full text-center py-2.5 rounded-xl text-xs font-sans transition-colors cursor-pointer hover:opacity-90"
                        style={{
                            backgroundColor: `${color}25`,
                            color,
                            border: `1px solid ${color}50`,
                        }}
                    >
                        ▶ Spill cinematic tour
                    </button>
                </div>

                {/* Wikipedia-lenke */}
                {monument.wikipediaUrl && (
                    <div className="px-4 pb-3">
                        <a
                            href={monument.wikipediaUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block w-full text-center py-2 rounded-xl text-[11px] font-sans transition-colors hover:opacity-80"
                            style={{
                                backgroundColor: 'rgba(255,255,255,0.04)',
                                color: 'var(--text-secondary)',
                            }}
                        >
                            Les mer på Wikipedia
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
}
