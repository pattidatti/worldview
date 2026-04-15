import { useMemo, useState } from 'react';
import { useTimelineEvents } from '@/context/TimelineEventContext';
import { useGates } from '@/context/GateContext';
import type { TimelineEvent } from '@/types/timeline-event';

interface Props {
    windowStart: number;
    windowEnd: number;
}

function eventColor(ev: TimelineEvent, gateColors: Map<string, string>): string {
    if (ev.kind === 'gate-crossing') {
        return gateColors.get(ev.gateId) ?? 'var(--color-gates)';
    }
    if (ev.kind === 'layer-alert') {
        return 'var(--accent-orange)';
    }
    return 'rgba(180,180,180,0.6)'; // data-gap
}

function formatTooltip(ev: TimelineEvent, gateNames: Map<string, string>): string {
    const time = new Date(ev.timestamp).toLocaleTimeString('nb-NO', {
        hour: '2-digit',
        minute: '2-digit',
    });
    if (ev.kind === 'gate-crossing') {
        const name = gateNames.get(ev.gateId) ?? 'Ukjent port';
        const dir = ev.direction === 'left-to-right' ? '→' : '←';
        return `${time} · ${name} ${dir} ${ev.entityType === 'flight' ? 'fly' : 'skip'}`;
    }
    if (ev.kind === 'layer-alert') {
        return `${time} · ${ev.layerId}: ${ev.message}`;
    }
    const from = new Date(ev.fromTs).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
    const to = new Date(ev.toTs).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
    return `Data-gap ${ev.layerId}: ${from}–${to}`;
}

export function EventMarkers({ windowStart, windowEnd }: Props) {
    const { events } = useTimelineEvents();
    const { gates } = useGates();
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);

    const gateColors = useMemo(() => {
        const m = new Map<string, string>();
        gates.forEach((g) => m.set(g.id, g.color));
        return m;
    }, [gates]);

    const gateNames = useMemo(() => {
        const m = new Map<string, string>();
        gates.forEach((g) => m.set(g.id, g.name));
        return m;
    }, [gates]);

    const windowMs = windowEnd - windowStart;
    const visible = useMemo(
        () => events.filter((e) => e.timestamp >= windowStart && e.timestamp <= windowEnd),
        [events, windowStart, windowEnd],
    );

    return (
        <>
            {visible.map((ev, i) => {
                const frac = (ev.timestamp - windowStart) / windowMs;
                const color = eventColor(ev, gateColors);
                const isGap = ev.kind === 'data-gap';

                if (isGap) {
                    const fromFrac = (ev.fromTs - windowStart) / windowMs;
                    const toFrac = (ev.toTs - windowStart) / windowMs;
                    return (
                        <div
                            key={ev.id}
                            onPointerEnter={() => setHoverIdx(i)}
                            onPointerLeave={() => setHoverIdx(null)}
                            style={{
                                position: 'absolute',
                                left: `${Math.max(0, fromFrac) * 100}%`,
                                width: `${Math.min(1 - fromFrac, toFrac - fromFrac) * 100}%`,
                                top: 4,
                                bottom: 4,
                                background: 'rgba(140,140,160,0.2)',
                                borderLeft: '1px dashed rgba(180,180,180,0.4)',
                                borderRight: '1px dashed rgba(180,180,180,0.4)',
                                pointerEvents: 'auto',
                            }}
                            title={formatTooltip(ev, gateNames)}
                        />
                    );
                }

                return (
                    <div
                        key={ev.id}
                        onPointerEnter={() => setHoverIdx(i)}
                        onPointerLeave={() => setHoverIdx(null)}
                        style={{
                            position: 'absolute',
                            left: `${frac * 100}%`,
                            top: '50%',
                            width: 6,
                            height: 6,
                            marginLeft: -3,
                            marginTop: -3,
                            borderRadius: 999,
                            background: color,
                            boxShadow: hoverIdx === i ? `0 0 6px ${color}` : undefined,
                            pointerEvents: 'auto',
                            cursor: 'pointer',
                        }}
                        title={formatTooltip(ev, gateNames)}
                    />
                );
            })}
        </>
    );
}
