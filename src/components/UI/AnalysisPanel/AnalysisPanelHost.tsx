import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useGates } from '@/context/GateContext';
import { addToast } from '../Toast';
import { DeltaPanel } from './DeltaPanel';
import { TrendPanel } from './TrendPanel';
import type { LayerId } from '@/types/layers';
import type { DragPosition } from '@/hooks/useDrag';

type PanelState =
    | { id: string; type: 'delta'; layerId: LayerId; position: DragPosition; openedAt: number }
    | { id: string; type: 'trend'; gateId: string; position: DragPosition; openedAt: number };

interface AnalysisPanelHostValue {
    addDelta: (layerId: LayerId) => void;
    addTrend: (gateId: string) => void;
    hideAll: () => void;
    count: number;
}

const STORAGE_KEY = 'worldview-analysis-panels';
const MAX_PANELS = 8;
const CASCADE_STEP = 24;
const CASCADE_BASE = { x: 120, y: 120 };

function loadPanels(): PanelState[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed as PanelState[];
    } catch {
        return [];
    }
}

function savePanels(panels: PanelState[]) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(panels));
    } catch { /* quota */ }
}

function newId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `panel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function cascadePosition(existing: PanelState[]): DragPosition {
    const n = existing.length;
    return {
        x: CASCADE_BASE.x + (n % MAX_PANELS) * CASCADE_STEP,
        y: CASCADE_BASE.y + (n % MAX_PANELS) * CASCADE_STEP,
    };
}

const Ctx = createContext<AnalysisPanelHostValue | null>(null);

export function useAnalysisPanels(): AnalysisPanelHostValue {
    const v = useContext(Ctx);
    if (!v) throw new Error('AnalysisPanelHost må monteres');
    return v;
}

export function AnalysisPanelProvider({ children }: { children: ReactNode }) {
    const [panels, setPanels] = useState<PanelState[]>(() => loadPanels());
    const { gates } = useGates();

    useEffect(() => {
        savePanels(panels);
    }, [panels]);

    // Auto-lukk trend-paneler når porten slettes.
    useEffect(() => {
        const activeIds = new Set(gates.map((g) => g.id));
        const orphans = panels.filter((p) => p.type === 'trend' && !activeIds.has(p.gateId));
        if (orphans.length === 0) return;
        const orphanSet = new Set(orphans.map((p) => p.id));
        setPanels((prev) => prev.filter((p) => !orphanSet.has(p.id)));
        orphans.forEach(() => addToast('Port slettet — trend-panel fjernet', 'info'));
    }, [gates, panels]);

    const evictOldestIfFull = (list: PanelState[]): { trimmed: PanelState[]; evicted: boolean } => {
        if (list.length < MAX_PANELS) return { trimmed: list, evicted: false };
        const oldest = list.reduce((a, b) => (a.openedAt <= b.openedAt ? a : b));
        return { trimmed: list.filter((p) => p.id !== oldest.id), evicted: true };
    };

    const addDelta = useCallback((layerId: LayerId) => {
        let didEvict = false;
        setPanels((prev) => {
            const { trimmed, evicted } = evictOldestIfFull(prev);
            didEvict = evicted;
            const panel: PanelState = {
                id: newId(),
                type: 'delta',
                layerId,
                position: cascadePosition(trimmed),
                openedAt: Date.now(),
            };
            return [...trimmed, panel];
        });
        if (didEvict) addToast('Eldste panel lukket — maks 8 samtidig', 'info');
    }, []);

    const addTrend = useCallback((gateId: string) => {
        let didEvict = false;
        setPanels((prev) => {
            const { trimmed, evicted } = evictOldestIfFull(prev);
            didEvict = evicted;
            const panel: PanelState = {
                id: newId(),
                type: 'trend',
                gateId,
                position: cascadePosition(trimmed),
                openedAt: Date.now(),
            };
            return [...trimmed, panel];
        });
        if (didEvict) addToast('Eldste panel lukket — maks 8 samtidig', 'info');
    }, []);

    const hideAll = useCallback(() => {
        setPanels([]);
    }, []);

    const closeOne = useCallback((id: string) => {
        setPanels((prev) => prev.filter((p) => p.id !== id));
    }, []);

    const movePanel = useCallback((id: string, pos: DragPosition) => {
        setPanels((prev) => prev.map((p) => (p.id === id ? { ...p, position: pos } : p)));
    }, []);

    const value = useMemo<AnalysisPanelHostValue>(
        () => ({ addDelta, addTrend, hideAll, count: panels.length }),
        [addDelta, addTrend, hideAll, panels.length],
    );

    return (
        <Ctx.Provider value={value}>
            {children}
            {panels.map((p) => {
                if (p.type === 'delta') {
                    return (
                        <DeltaPanel
                            key={p.id}
                            layerId={p.layerId}
                            position={p.position}
                            onPositionChange={(pos) => movePanel(p.id, pos)}
                            onClose={() => closeOne(p.id)}
                        />
                    );
                }
                return (
                    <TrendPanel
                        key={p.id}
                        gateId={p.gateId}
                        position={p.position}
                        onPositionChange={(pos) => movePanel(p.id, pos)}
                        onClose={() => closeOne(p.id)}
                    />
                );
            })}
        </Ctx.Provider>
    );
}
