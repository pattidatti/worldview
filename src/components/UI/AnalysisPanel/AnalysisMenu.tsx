import { useEffect, useRef, useState } from 'react';
import { useLayers } from '@/context/LayerContext';
import { useGates } from '@/context/GateContext';
import { LAYER_ICONS, type LayerId } from '@/types/layers';

interface AnalysisMenuProps {
    onAddDelta: (layerId: LayerId) => void;
    onAddTrend: (gateId: string) => void;
    onHideAll: () => void;
    onClose: () => void;
}

type Submenu = 'root' | 'delta-pick' | 'trend-pick';

export function AnalysisMenu({ onAddDelta, onAddTrend, onHideAll, onClose }: AnalysisMenuProps) {
    const { layers } = useLayers();
    const { gates } = useGates();
    const [view, setView] = useState<Submenu>('root');
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        window.addEventListener('mousedown', handler);
        return () => window.removeEventListener('mousedown', handler);
    }, [onClose]);

    const visibleLayers = layers.filter((l) => l.id !== 'gates');

    const rowStyle: React.CSSProperties = {
        padding: '6px 12px',
        cursor: 'pointer',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        fontSize: 11,
    };

    return (
        <div
            ref={ref}
            className="absolute right-0 mt-2 font-mono"
            style={{
                background: 'rgba(6,8,18,0.95)',
                border: '1px solid rgba(255,255,255,0.12)',
                backdropFilter: 'blur(16px)',
                minWidth: 240,
                maxHeight: 400,
                overflowY: 'auto',
                color: 'var(--text-primary, #fff)',
                zIndex: 30,
            }}
        >
            {view === 'root' && (
                <>
                    <div
                        style={rowStyle}
                        onClick={() => setView('delta-pick')}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,255,136,0.08)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                        + Delta-panel (lag)
                    </div>
                    <div
                        style={{ ...rowStyle, opacity: gates.length === 0 ? 0.4 : 1, cursor: gates.length === 0 ? 'not-allowed' : 'pointer' }}
                        onClick={() => gates.length > 0 && setView('trend-pick')}
                        onMouseEnter={(e) => {
                            if (gates.length > 0) e.currentTarget.style.background = 'rgba(0,255,136,0.08)';
                        }}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                        + Trend-panel (port)
                        {gates.length === 0 && (
                            <div style={{ fontSize: 9, textTransform: 'none', letterSpacing: 0, color: 'var(--text-muted)' }}>
                                ingen porter
                            </div>
                        )}
                    </div>
                    <div
                        style={{ ...rowStyle, borderTop: '1px solid rgba(255,255,255,0.08)' }}
                        onClick={() => { onHideAll(); onClose(); }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,100,100,0.1)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                        Skjul alle paneler
                    </div>
                </>
            )}
            {view === 'delta-pick' && (
                <>
                    <div
                        style={{ ...rowStyle, color: 'var(--text-muted)', cursor: 'pointer' }}
                        onClick={() => setView('root')}
                    >
                        ← Tilbake
                    </div>
                    {visibleLayers.map((l) => (
                        <div
                            key={l.id}
                            style={rowStyle}
                            onClick={() => { onAddDelta(l.id); onClose(); }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,255,136,0.08)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                            <span style={{ marginRight: 8 }}>{LAYER_ICONS[l.id]}</span>
                            {l.name}
                        </div>
                    ))}
                </>
            )}
            {view === 'trend-pick' && (
                <>
                    <div
                        style={{ ...rowStyle, color: 'var(--text-muted)', cursor: 'pointer' }}
                        onClick={() => setView('root')}
                    >
                        ← Tilbake
                    </div>
                    {gates.map((g) => (
                        <div
                            key={g.id}
                            style={rowStyle}
                            onClick={() => { onAddTrend(g.id); onClose(); }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,255,136,0.08)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                            <span style={{ marginRight: 8 }}>⛩</span>
                            {g.name}
                        </div>
                    ))}
                </>
            )}
        </div>
    );
}
