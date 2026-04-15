import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import {
    GATE_SCHEMA_VERSION,
    type Gate,
    type GateStorage,
    type LatLon,
} from '@/types/gate';

const STORAGE_KEY = 'worldview-gates';
const DEFAULT_COLOR = 'var(--color-gates)';

export type DrawState =
    | { active: false }
    | { active: true; vertices: LatLon[] };

interface GateContextValue {
    gates: Gate[];
    addGate: (gate: Omit<Gate, 'id' | 'createdAt' | 'color' | 'visible'>) => Gate;
    updateGate: (id: string, patch: Partial<Omit<Gate, 'id' | 'createdAt'>>) => void;
    removeGate: (id: string) => void;
    toggleVisibility: (id: string) => void;
    draw: DrawState;
    isDrawing: boolean;
    isDrawingRef: React.MutableRefObject<boolean>;
    startDrawing: () => void;
    cancelDrawing: () => void;
    pushDrawVertex: (vertex: LatLon) => void;
    popDrawVertex: () => void;
    finishDrawing: () => LatLon[] | null;
}

const GateContext = createContext<GateContextValue | null>(null);

function loadGates(): Gate[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as GateStorage;
        if (parsed.version !== GATE_SCHEMA_VERSION) return [];
        return Array.isArray(parsed.gates) ? parsed.gates : [];
    } catch (e) {
        console.warn('[GateContext] Feil ved lesing av porter fra localStorage:', e);
        return [];
    }
}

function saveGates(gates: Gate[]) {
    try {
        const payload: GateStorage = {
            version: GATE_SCHEMA_VERSION,
            gates,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
        console.warn('[GateContext] Feil ved skriving av porter til localStorage:', e);
    }
}

function newId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `gate-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function GateProvider({ children }: { children: ReactNode }) {
    const [gates, setGates] = useState<Gate[]>(() => loadGates());
    const [draw, setDraw] = useState<DrawState>({ active: false });
    const isDrawingRef = useRef<boolean>(false);

    const persist = useCallback((next: Gate[]) => {
        saveGates(next);
        return next;
    }, []);

    const addGate = useCallback<GateContextValue['addGate']>(
        (input) => {
            const gate: Gate = {
                id: newId(),
                createdAt: Date.now(),
                color: DEFAULT_COLOR,
                visible: true,
                name: input.name,
                vertices: input.vertices,
            };
            setGates((prev) => persist([...prev, gate]));
            return gate;
        },
        [persist],
    );

    const updateGate = useCallback<GateContextValue['updateGate']>(
        (id, patch) => {
            setGates((prev) =>
                persist(prev.map((g) => (g.id === id ? { ...g, ...patch } : g))),
            );
        },
        [persist],
    );

    const removeGate = useCallback(
        (id: string) => {
            setGates((prev) => persist(prev.filter((g) => g.id !== id)));
        },
        [persist],
    );

    const toggleVisibility = useCallback(
        (id: string) => {
            setGates((prev) =>
                persist(
                    prev.map((g) =>
                        g.id === id ? { ...g, visible: !g.visible } : g,
                    ),
                ),
            );
        },
        [persist],
    );

    const startDrawing = useCallback(() => {
        isDrawingRef.current = true;
        setDraw({ active: true, vertices: [] });
    }, []);

    const cancelDrawing = useCallback(() => {
        isDrawingRef.current = false;
        setDraw({ active: false });
    }, []);

    const pushDrawVertex = useCallback((vertex: LatLon) => {
        setDraw((prev) => {
            if (!prev.active) return prev;
            return { active: true, vertices: [...prev.vertices, vertex] };
        });
    }, []);

    const popDrawVertex = useCallback(() => {
        setDraw((prev) => {
            if (!prev.active) return prev;
            return {
                active: true,
                vertices: prev.vertices.slice(0, -1),
            };
        });
    }, []);

    const finishDrawing = useCallback<GateContextValue['finishDrawing']>(() => {
        let captured: LatLon[] | null = null;
        setDraw((prev) => {
            if (!prev.active) return prev;
            captured = prev.vertices;
            return { active: false };
        });
        isDrawingRef.current = false;
        return captured;
    }, []);

    const value = useMemo<GateContextValue>(
        () => ({
            gates,
            addGate,
            updateGate,
            removeGate,
            toggleVisibility,
            draw,
            isDrawing: draw.active,
            isDrawingRef,
            startDrawing,
            cancelDrawing,
            pushDrawVertex,
            popDrawVertex,
            finishDrawing,
        }),
        [
            gates,
            addGate,
            updateGate,
            removeGate,
            toggleVisibility,
            draw,
            startDrawing,
            cancelDrawing,
            pushDrawVertex,
            popDrawVertex,
            finishDrawing,
        ],
    );

    return <GateContext.Provider value={value}>{children}</GateContext.Provider>;
}

export function useGates() {
    const ctx = useContext(GateContext);
    if (!ctx) throw new Error('useGates must be used within GateProvider');
    return ctx;
}
