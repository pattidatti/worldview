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
        setPanels((prev) => {
            const activeIds = new Set(gates.map((g) => g.id));
            const next = prev.filter((p) => {
                if (p.type !== 'trend') return true;
                if (activeIds.has(p.gateId)) return true;
                addToast(`Port slettet — trend-panel fjernet`, 'info');
                return false;
            });
            return next.length === prev.length ? prev : next;
        });
    }, [gates]);

    const evictOldestIfFull = (list: PanelState[]): PanelState[] => {
        if (list.length < MAX_PANELS) return list;
        const oldest = list.reduce((a, b) => (a.openedAt <= b.openedAt ? a : b));
        addToast('Eldste panel lukket — maks 8 samtidig', 'info');
        return list.filter((p) => p.id !== oldest.id);
    };

    const addDelta = useCallback((layerId: LayerId) => {
        setPanels((prev) => {
            const trimmed = evictOldestIfFull(prev);
            const panel: PanelState = {
                id: newId(),
                type: 'delta',
                layerId,
                position: cascadePosition(trimmed),
                openedAt: Date.now(),
            };
            return [...trimmed, panel];
        });
    }, []);

    const addTrend = useCallback((gateId: string) => {
        setPanels((prev) => {
            const trimmed = evictOldestIfFull(prev);
            const panel: PanelState = {
                id: newId(),
                type: 'trend',
                gateId,
                position: cascadePosition(trimmed),
                openedAt: Date.now(),
            };
            return [...trimmed, panel];
        });
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
