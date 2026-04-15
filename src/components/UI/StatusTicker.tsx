import { useLayers } from '@/context/LayerContext';
import { useTimelineMode } from '@/context/TimelineModeContext';
import { AnimatedCount } from './AnimatedCount';

function formatReplayTime(ts: number): string {
    return new Date(ts).toLocaleString('nb-NO', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatAge(ts: number | null): string {
    if (!ts) return '';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return ' nå';
    if (s < 3600) return ` ${Math.floor(s / 60)}m`;
    return ` ${Math.floor(s / 3600)}t`;
}

export function StatusTicker() {
    const { layers } = useLayers();
    const { mode, cursor } = useTimelineMode();
    const active = layers.filter((l) => l.visible && (l.count > 0 || l.loading || l.error));

    if (active.length === 0 && mode === 'live') return null;

    return (
        <div
            className="fixed bottom-0 left-0 right-0 z-10 flex items-center overflow-hidden"
            style={{
                height: '36px',
                background: 'rgba(10, 10, 20, 0.75)',
                backdropFilter: 'blur(8px)',
                borderTop: '1px solid rgba(255,255,255,0.07)',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                letterSpacing: '0.06em',
                paddingLeft: '1rem',
                paddingRight: '1rem',
                gap: '0',
            }}
        >
            {mode === 'replay' ? (
                <span
                    style={{
                        color: 'var(--accent-orange)',
                        marginRight: '12px',
                        fontWeight: 600,
                    }}
                    title="Replay-modus"
                >
                    ▶ REPLAY · {formatReplayTime(cursor)}
                </span>
            ) : (
                <span style={{ color: 'rgba(0, 212, 255, 0.5)', marginRight: '12px' }}>◈</span>
            )}
            <div className="flex items-center gap-0 overflow-hidden" style={{ whiteSpace: 'nowrap' }}>
                {active.map((l, i) => (
                    <span key={l.id} className="flex items-center">
                        {i > 0 && (
                            <span style={{ color: 'rgba(255,255,255,0.15)', margin: '0 10px' }}>·</span>
                        )}
                        <span style={{ color: l.color, opacity: 0.8 }}>{l.name.toUpperCase()}</span>
                        <span style={{ marginLeft: '5px' }}>
                            {l.error ? (
                                <span style={{ color: 'var(--accent-orange, #ff6b35)' }}>⚠</span>
                            ) : l.loading && l.count === 0 ? (
                                <span className="animate-pulse" style={{ color: 'rgba(255,255,255,0.35)' }}>···</span>
                            ) : (
                                <AnimatedCount
                                    value={l.count}
                                    color="rgba(255,255,255,0.35)"
                                    flashColor={l.color}
                                />
                            )}
                        </span>
                        {l.lastUpdated && !l.error && (
                            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '8px', marginLeft: '3px' }}>
                                {formatAge(l.lastUpdated)}
                            </span>
                        )}
                    </span>
                ))}
            </div>
        </div>
    );
}
