import { useState, useEffect, useRef } from 'react';
import { useLayers } from '@/context/LayerContext';
import { LAYER_ICONS, type LayerId } from '@/types/layers';

interface LogEvent {
    id: number;
    time: string;
    icon: string;
    name: string;
    diff: number;
    total: number;
    color: string;
}

let _eid = 0;

function useEventLog(): LogEvent[] {
    const { layers } = useLayers();
    const [events, setEvents] = useState<LogEvent[]>([]);
    const prevCountRef = useRef<Partial<Record<LayerId, number>>>({});
    const prevUpdatedRef = useRef<Partial<Record<LayerId, number | null>>>({});

    useEffect(() => {
        const newEvents: LogEvent[] = [];

        for (const layer of layers) {
            if (!layer.visible) continue;
            const prevUpdated = prevUpdatedRef.current[layer.id];
            if (layer.lastUpdated === prevUpdated) continue;

            const prevCount = prevCountRef.current[layer.id] ?? 0;
            const diff = layer.count - prevCount;

            if (Math.abs(diff) >= 1 || (prevCount === 0 && layer.count > 0)) {
                newEvents.push({
                    id: _eid++,
                    time: new Date().toTimeString().slice(0, 8),
                    icon: LAYER_ICONS[layer.id],
                    name: layer.name.toUpperCase(),
                    diff,
                    total: layer.count,
                    color: layer.color,
                });
            }

            prevUpdatedRef.current[layer.id] = layer.lastUpdated;
            prevCountRef.current[layer.id] = layer.count;
        }

        if (newEvents.length > 0) {
            setEvents((prev) => [...newEvents, ...prev].slice(0, 8));
        }
    }, [layers]);

    return events;
}

export function EventLog() {
    const events = useEventLog();
    const [collapsed, setCollapsed] = useState(false);

    if (events.length === 0) return null;

    return (
        <div
            className="absolute z-10"
            style={{ top: '56px', right: '1.5rem', width: '220px' }}
        >
            <div
                style={{
                    background: 'rgba(10, 10, 20, 0.75)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '10px',
                    overflow: 'hidden',
                }}
            >
                {/* Header */}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="flex items-center justify-between w-full px-3 py-2 cursor-pointer hover:bg-white/5 transition-colors"
                    style={{ borderBottom: collapsed ? 'none' : '1px solid rgba(255,255,255,0.07)' }}
                >
                    <span
                        className="font-mono font-bold tracking-widest uppercase"
                        style={{ fontSize: '9px', color: 'rgba(0, 212, 255, 0.6)' }}
                    >
                        HENDELSER
                    </span>
                    <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)' }}>
                        {collapsed ? '▼' : '▲'}
                    </span>
                </button>

                {/* Events */}
                {!collapsed && (
                    <div className="flex flex-col">
                        {events.map((ev) => (
                            <div
                                key={ev.id}
                                className="flex items-baseline gap-2 px-3 py-1"
                                style={{
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: '10px',
                                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                                    animation: 'fade-in 200ms ease-out',
                                }}
                            >
                                <span style={{ color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>
                                    {ev.time}
                                </span>
                                <span style={{ flexShrink: 0 }}>{ev.icon}</span>
                                <span style={{ color: ev.color, opacity: 0.85, flexShrink: 0 }}>
                                    {ev.name}
                                </span>
                                <span style={{ color: 'rgba(255,255,255,0.35)', marginLeft: 'auto', flexShrink: 0 }}>
                                    {ev.diff > 0 ? '+' : ''}{ev.diff !== 0 ? ev.diff : ev.total.toLocaleString('nb-NO')}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
