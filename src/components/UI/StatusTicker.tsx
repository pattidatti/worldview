import { useActiveLayerIds, useLayerStatus, useLayerStore } from '@/store/layerStore';
import { useTimelineMode } from '@/context/TimelineModeContext';
import { AnimatedCount } from './AnimatedCount';
import type { LayerId } from '@/types/layers';

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

function TickerEntry({ id, first }: { id: LayerId; first: boolean }) {
    const status = useLayerStatus(id);
    const meta = useLayerStore((s) => s.meta[id]);
    const name = meta.name;
    const color = meta.color;
    return (
        <span className="flex items-center">
            {!first && (
                <span style={{ color: 'rgba(255,255,255,0.15)', margin: '0 10px' }}>·</span>
            )}
            <span style={{ color, opacity: 0.8 }}>{name.toUpperCase()}</span>
            <span style={{ marginLeft: '5px' }}>
                {status.error ? (
                    <span style={{ color: 'var(--accent-orange, #ff6b35)' }}>⚠</span>
                ) : status.loading && status.count === 0 ? (
                    <span className="animate-pulse" style={{ color: 'rgba(255,255,255,0.35)' }}>···</span>
                ) : (
                    <AnimatedCount value={status.count} color="rgba(255,255,255,0.35)" flashColor={color} />
                )}
            </span>
            {status.lastUpdated && !status.error && (
                <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '8px', marginLeft: '3px' }}>
                    {formatAge(status.lastUpdated)}
                </span>
            )}
        </span>
    );
}

export function StatusTicker() {
    const active = useActiveLayerIds();
    const { mode, cursor } = useTimelineMode();

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
                    style={{ color: 'var(--accent-orange)', marginRight: '12px', fontWeight: 600 }}
                    title="Replay-modus"
                >
                    ▶ REPLAY · {formatReplayTime(cursor)}
                </span>
            ) : (
                <span style={{ color: 'rgba(0, 212, 255, 0.5)', marginRight: '12px' }}>◈</span>
            )}
            <div className="flex items-center gap-0 overflow-hidden" style={{ whiteSpace: 'nowrap' }}>
                {active.map((id, i) => (
                    <TickerEntry key={id} id={id} first={i === 0} />
                ))}
            </div>
        </div>
    );
}
