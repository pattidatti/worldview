import { useEffect, useMemo, useRef, useState } from 'react';
import { useGates } from '@/context/GateContext';
import { useLayers } from '@/context/LayerContext';
import { useTimelineEvents } from '@/context/TimelineEventContext';

function countCrossings24h(gateId: string, events: ReturnType<typeof useTimelineEvents>['events']): number {
    const windowStart = Date.now() - 24 * 60 * 60 * 1000;
    let n = 0;
    for (const ev of events) {
        if (ev.kind !== 'gate-crossing') continue;
        if (ev.gateId !== gateId) continue;
        if (ev.timestamp < windowStart) continue;
        n += 1;
    }
    return n;
}

function GateRow({
    name,
    visible,
    count,
    pulsing,
    onToggle,
    onRemove,
    onRename,
}: {
    name: string;
    visible: boolean;
    count: number;
    pulsing: boolean;
    onToggle: () => void;
    onRemove: () => void;
    onRename: (next: string) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(name);

    useEffect(() => {
        if (!editing) setDraft(name);
    }, [name, editing]);

    function commit() {
        const trimmed = draft.trim();
        if (trimmed && trimmed !== name) onRename(trimmed);
        setEditing(false);
    }

    return (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5">
            <button
                onClick={onToggle}
                title={visible ? 'Skjul port' : 'Vis port'}
                className="shrink-0 w-4 h-4 flex items-center justify-center text-[10px] cursor-pointer"
            >
                <span
                    className="w-2 h-2 rounded-full"
                    style={{
                        backgroundColor: visible ? 'var(--color-gates)' : '#555',
                    }}
                />
            </button>

            {editing ? (
                <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            commit();
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setDraft(name);
                            setEditing(false);
                        }
                    }}
                    className="flex-1 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--color-gates)]/60"
                />
            ) : (
                <button
                    onClick={() => setEditing(true)}
                    className={`flex-1 text-left text-xs truncate cursor-pointer ${
                        visible ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]'
                    }`}
                    title="Klikk for å omdøpe"
                >
                    {name}
                </button>
            )}

            <span
                className={`font-mono text-[10px] shrink-0 transition-all duration-150 ${
                    count === 0 ? 'text-[var(--text-muted)]' : 'text-[var(--color-gates)]'
                }`}
                style={{
                    transform: pulsing ? 'scale(1.5)' : 'scale(1)',
                    textShadow: pulsing ? '0 0 6px var(--color-gates)' : 'none',
                }}
                title="Kryssinger siste 24t"
            >
                {count === 0 ? '—' : count}
            </span>

            <button
                onClick={onRemove}
                title="Slett port"
                className="shrink-0 text-[10px] text-[var(--text-muted)] hover:text-red-400 cursor-pointer px-1"
            >
                ✕
            </button>
        </div>
    );
}

export function GatePanel() {
    const { gates, toggleVisibility, removeGate, updateGate, startDrawing, isDrawing } = useGates();
    const { isVisible } = useLayers();
    const { events } = useTimelineEvents();
    const layerVisible = isVisible('gates');

    const counts = useMemo(() => {
        const map = new Map<string, number>();
        for (const g of gates) map.set(g.id, countCrossings24h(g.id, events));
        return map;
    }, [gates, events]);

    const prevCountsRef = useRef<Map<string, number>>(new Map());
    const [pulsing, setPulsing] = useState<Set<string>>(new Set());

    useEffect(() => {
        const changed: string[] = [];
        for (const [id, count] of counts) {
            const prev = prevCountsRef.current.get(id) ?? 0;
            if (count > prev) changed.push(id);
        }
        prevCountsRef.current = new Map(counts);
        if (changed.length > 0) {
            setPulsing((prev) => {
                const next = new Set(prev);
                changed.forEach((id) => next.add(id));
                return next;
            });
            const t = setTimeout(() => {
                setPulsing((prev) => {
                    const next = new Set(prev);
                    changed.forEach((id) => next.delete(id));
                    return next;
                });
            }, 450);
            return () => clearTimeout(t);
        }
    }, [counts]);

    if (!layerVisible) return null;

    return (
        <div className="absolute right-4 top-20 z-10 w-56">
            <div className="bg-[var(--bg-ui)] backdrop-blur-md border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
                    <span className="font-mono text-[10px] tracking-wider text-[var(--color-gates)]">
                        ⛩ PORTER · {gates.length}
                    </span>
                    <button
                        onClick={() => {
                            if (!isDrawing) startDrawing();
                        }}
                        disabled={isDrawing}
                        className={`font-mono text-[10px] tracking-wider px-2 py-0.5 rounded border cursor-pointer transition-colors ${
                            isDrawing
                                ? 'border-white/10 text-[var(--text-muted)] cursor-not-allowed opacity-50'
                                : 'border-[var(--color-gates)]/50 text-[var(--color-gates)] hover:bg-[var(--color-gates)]/10'
                        }`}
                    >
                        + TEGN
                    </button>
                </div>

                {gates.length === 0 ? (
                    <p className="px-3 py-4 text-xs text-[var(--text-muted)] text-center">
                        Ingen porter ennå.
                        <br />
                        Trykk + TEGN for å starte.
                    </p>
                ) : (
                    <div className="py-1 flex flex-col">
                        {gates.map((g) => (
                            <GateRow
                                key={g.id}
                                name={g.name}
                                visible={g.visible}
                                count={counts.get(g.id) ?? 0}
                                pulsing={pulsing.has(g.id)}
                                onToggle={() => toggleVisibility(g.id)}
                                onRemove={() => removeGate(g.id)}
                                onRename={(next) => updateGate(g.id, { name: next })}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
