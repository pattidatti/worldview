import {
    createContext,
    useCallback,
    useContext,
    useEffect,
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
import { useAuth } from './AuthContext';
import {
    deleteGate as remoteDelete,
    loadVisibility,
    patchGate as remotePatch,
    saveVisibility,
    subscribeGates,
    writeGate as remoteWrite,
} from '@/services/gateSync';

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
    const { user } = useAuth();
    const uid = user?.uid ?? null;
    const remoteMode = !!uid;

    const [gates, setGates] = useState<Gate[]>(() => loadGates());
    const [draw, setDraw] = useState<DrawState>({ active: false });
    const isDrawingRef = useRef<boolean>(false);

    // Subscribe to Firestore when logged in. In remote mode, Firestore is source of truth.
    useEffect(() => {
        if (!uid) return;
        const unsub = subscribeGates(uid, (remoteGates) => {
            setGates(remoteGates);
        });
        return () => unsub();
    }, [uid]);

    // Migrer localStorage-gates uten ownerUid på første innlogging (engangsoperasjon).
    useEffect(() => {
        if (!uid) return;
        const legacy = loadGates();
        const unclaimed = legacy.filter((g) => !g.ownerUid);
        if (unclaimed.length === 0) return;
        (async () => {
            for (const g of unclaimed) {
                try {
                    await remoteWrite({ ...g, ownerUid: uid }, uid);
                } catch (e) {
                    console.warn('[GateContext] migrering av gate feilet', e);
                }
            }
            // Clear legacy storage etter migrering
            localStorage.removeItem(STORAGE_KEY);
        })();
    }, [uid]);

    const addGate = useCallback<GateContextValue['addGate']>(
        (input) => {
            const gate: Gate = {
                id: newId(),
                createdAt: Date.now(),
                color: DEFAULT_COLOR,
                visible: true,
                name: input.name,
                vertices: input.vertices,
                ownerUid: uid ?? undefined,
                schemaVersion: GATE_SCHEMA_VERSION,
            };
            if (remoteMode && uid) {
                // Optimistic local add; Firestore snapshot vil confirm.
                setGates((prev) => [...prev, gate]);
                remoteWrite(gate, uid).catch((e) =>
                    console.warn('[GateContext] remote write feilet', e),
                );
            } else {
                setGates((prev) => {
                    const next = [...prev, gate];
                    saveGates(next);
                    return next;
                });
            }
            return gate;
        },
        [remoteMode, uid],
    );

    const updateGate = useCallback<GateContextValue['updateGate']>(
        (id, patch) => {
            if (remoteMode) {
                const clean: Partial<Pick<Gate, 'name' | 'vertices' | 'color'>> = {};
                if (patch.name !== undefined) clean.name = patch.name;
                if (patch.vertices !== undefined) clean.vertices = patch.vertices;
                if (patch.color !== undefined) clean.color = patch.color;
                if (Object.keys(clean).length > 0) {
                    remotePatch(id, clean).catch((e) =>
                        console.warn('[GateContext] remote patch feilet', e),
                    );
                }
                // visible håndteres av toggleVisibility — ignorer her
                setGates((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
            } else {
                setGates((prev) => {
                    const next = prev.map((g) => (g.id === id ? { ...g, ...patch } : g));
                    saveGates(next);
                    return next;
                });
            }
        },
        [remoteMode],
    );

    const removeGate = useCallback(
        (id: string) => {
            if (remoteMode) {
                remoteDelete(id).catch((e) =>
                    console.warn('[GateContext] remote delete feilet', e),
                );
                setGates((prev) => prev.filter((g) => g.id !== id));
            } else {
                setGates((prev) => {
                    const next = prev.filter((g) => g.id !== id);
                    saveGates(next);
                    return next;
                });
            }
        },
        [remoteMode],
    );

    const toggleVisibility = useCallback(
        (id: string) => {
            setGates((prev) => {
                const next = prev.map((g) =>
                    g.id === id ? { ...g, visible: !g.visible } : g,
                );
                if (remoteMode && uid) {
                    const map = loadVisibility(uid);
                    const updated = next.find((g) => g.id === id);
                    if (updated) {
                        map[id] = updated.visible;
                        saveVisibility(uid, map);
                    }
                } else {
                    saveGates(next);
                }
                return next;
            });
        },
        [remoteMode, uid],
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
