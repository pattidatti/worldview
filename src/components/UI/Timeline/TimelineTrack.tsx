import { useCallback, useRef, useState } from 'react';
import { useTimelineMode, TIMELINE_WINDOW_MS } from '@/context/TimelineModeContext';
import { EventMarkers } from './EventMarkers';

function formatCursorTime(ts: number): string {
    return new Date(ts).toLocaleString('nb-NO', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

interface Props {
    nowRef: { current: number };
}

export function TimelineTrack({ nowRef }: Props) {
    const { mode, cursor, setCursor, setMode } = useTimelineMode();
    const trackRef = useRef<HTMLDivElement | null>(null);
    const [dragging, setDragging] = useState(false);
    const [hoverTs, setHoverTs] = useState<number | null>(null);

    // Timeline-vindu: alltid siste 24t til nå. Ved drag/klikk velges tid innenfor dette.
    const now = nowRef.current;
    const windowStart = now - TIMELINE_WINDOW_MS;

    const tsFromClientX = useCallback(
        (clientX: number): number => {
            const el = trackRef.current;
            if (!el) return now;
            const rect = el.getBoundingClientRect();
            const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            return windowStart + frac * TIMELINE_WINDOW_MS;
        },
        [windowStart, now],
    );

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        const ts = tsFromClientX(e.clientX);
        if (mode === 'live') setMode('replay');
        setCursor(ts);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const ts = tsFromClientX(e.clientX);
        setHoverTs(ts);
        if (dragging) {
            setCursor(ts);
        }
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        setDragging(false);
    };

    const handlePointerLeave = () => {
        setHoverTs(null);
    };

    // Cursor-posisjon i % av vinduet.
    const cursorFrac = Math.max(0, Math.min(1, (cursor - windowStart) / TIMELINE_WINDOW_MS));
    const hoverFrac = hoverTs != null ? Math.max(0, Math.min(1, (hoverTs - windowStart) / TIMELINE_WINDOW_MS)) : null;

    // Grid-strekker hver 4. time (6 stk på 24t).
    const gridLines = [];
    for (let i = 1; i < 6; i++) {
        gridLines.push(
            <div
                key={i}
                style={{
                    position: 'absolute',
                    left: `${(i / 6) * 100}%`,
                    top: 2,
                    bottom: 2,
                    width: 1,
                    background: 'rgba(255,255,255,0.05)',
                    pointerEvents: 'none',
                }}
            />,
        );
    }

    return (
        <div className="relative flex-1 h-full flex items-center">
            <div
                ref={trackRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerLeave}
                className="relative w-full h-6 rounded-md cursor-pointer select-none"
                style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                }}
            >
                {gridLines}

                <EventMarkers windowStart={windowStart} windowEnd={now} />

                {/* Cursor-linje */}
                <div
                    style={{
                        position: 'absolute',
                        left: `${cursorFrac * 100}%`,
                        top: -3,
                        bottom: -3,
                        width: 2,
                        marginLeft: -1,
                        background: mode === 'live' ? 'var(--accent-green)' : 'var(--accent-orange)',
                        boxShadow: `0 0 6px ${mode === 'live' ? 'var(--accent-green)' : 'var(--accent-orange)'}`,
                        pointerEvents: 'none',
                        transition: dragging ? 'none' : 'left 0.05s linear',
                    }}
                />

                {/* Hover-linje */}
                {hoverFrac != null && !dragging && (
                    <div
                        style={{
                            position: 'absolute',
                            left: `${hoverFrac * 100}%`,
                            top: 0,
                            bottom: 0,
                            width: 1,
                            background: 'rgba(255,255,255,0.25)',
                            pointerEvents: 'none',
                        }}
                    />
                )}

                {/* Hover-tooltip */}
                {hoverTs != null && !dragging && (
                    <div
                        style={{
                            position: 'absolute',
                            left: `${hoverFrac! * 100}%`,
                            transform: 'translateX(-50%)',
                            top: -22,
                            fontFamily: 'var(--font-mono)',
                            fontSize: 9,
                            color: 'var(--text-secondary)',
                            background: 'rgba(10,10,20,0.9)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            padding: '2px 6px',
                            borderRadius: 4,
                            whiteSpace: 'nowrap',
                            pointerEvents: 'none',
                        }}
                    >
                        {formatCursorTime(hoverTs)}
                    </div>
                )}
            </div>

            {/* Cursor-tidsstempel under track */}
            <div
                className="absolute font-mono text-[9px] text-[var(--text-muted)]"
                style={{
                    left: `${cursorFrac * 100}%`,
                    bottom: -14,
                    transform: 'translateX(-50%)',
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                }}
            >
                {formatCursorTime(cursor)}
            </div>
        </div>
    );
}
