import { useState } from 'react';
import { useActiveLayerIds, useLayerStatus, useLayerStore } from '@/store/layerStore';
import { useTimelineMode, useCursor } from '@/context/TimelineModeContext';
import { AnimatedCount } from './AnimatedCount';
import { EventLog, useEventLog } from './EventLog';
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
    const { mode } = useTimelineMode();
    const cursor = useCursor();
    const [eventsOpen, setEventsOpen] = useState(false);
    const events = useEventLog();

    if (active.length === 0 && mode === 'live') return null;

    return (
        <>
            {/* EventLog panel — slides up from StatusTicker */}
            {eventsOpen && events.length > 0 && (
                <div
                    className="fixed z-10 animate-fade-in-up"
                    style={{ bottom: '36px', right: '1rem', width: '13rem' }}
                >
                    <EventLog embedded />
                </div>
            )}

            <div
                className="fixed bottom-0 left-0 right-0 z-10 flex items-center overflow-hidden"
                style={{
                    height: '36px',
                    background: 'rgba(10, 10, 20, 0.75)',
                    borderTop: '1px solid rgba(255,255,255,0.07)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    letterSpacing: '0.06em',
                    paddingLeft: '1rem',
                    paddingRight: '0.25rem',
                    gap: '0',
                }}
            >
                {mode === 'replay' ? (
                    <span
                        style={{ color: 'var(--accent-orange)', marginRight: '12px', fontWeight: 600, flexShrink: 0 }}
                        title="Replay-modus"
                    >
                        ▶ REPLAY · {formatReplayTime(cursor)}
                    </span>
                ) : (
                    <span style={{ color: 'rgba(0, 212, 255, 0.5)', marginRight: '12px', flexShrink: 0 }}>◈</span>
                )}
                <div className="flex items-center gap-0 overflow-hidden flex-1" style={{ whiteSpace: 'nowrap' }}>
                    {active.map((id, i) => (
                        <TickerEntry key={id} id={id} first={i === 0} />
                    ))}
                </div>

                {/* HENDELSER toggle button */}
                {events.length > 0 && (
                    <button
                        onClick={() => setEventsOpen((v) => !v)}
                        className="flex items-center gap-1 px-2 py-1 ml-2 cursor-pointer transition-colors shrink-0 rounded"
                        style={{
                            fontSize: '9px',
                            letterSpacing: '0.1em',
                            background: eventsOpen ? 'rgba(0,212,255,0.12)' : 'transparent',
                            border: `1px solid ${eventsOpen ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.12)'}`,
                            color: eventsOpen ? 'var(--accent-blue)' : 'rgba(255,255,255,0.35)',
                        }}
                        title="Vis hendelseslogg"
                    >
                        HENDELSER
                        <span
                            className="font-mono text-[8px] px-1 rounded-full"
                            style={{
                                background: 'rgba(255,255,255,0.1)',
                                color: 'rgba(255,255,255,0.5)',
                                minWidth: 14,
                                textAlign: 'center',
                            }}
                        >
                            {events.length}
                        </span>
                    </button>
                )}
            </div>
        </>
    );
}
