import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { LAYER_DEFAULTS, type LayerConfig, type LayerId } from '@/types/layers';

const STORAGE_KEY = 'worldview-layer-visibility';

export interface LayerStatus {
    loading: boolean;
    count: number;
    error: string | null;
    lastUpdated: number | null;
}

interface LayerStoreState {
    visibility: Record<LayerId, boolean>;
    status: Record<LayerId, LayerStatus>;
    meta: Record<LayerId, { name: string; color: string }>;
    actions: {
        toggleLayer: (id: LayerId) => void;
        toggleCategory: (ids: LayerId[]) => void;
        /** Sett nøyaktig dette settet synlig, alt annet skjult (scene-preset). */
        setVisibleLayers: (ids: LayerId[]) => void;
        setLayerLoading: (id: LayerId, loading: boolean) => void;
        setLayerCount: (id: LayerId, count: number) => void;
        setLayerError: (id: LayerId, error: string | null) => void;
        setLayerLastUpdated: (id: LayerId, ts: number | null) => void;
    };
}

function loadVisibility(): Record<LayerId, boolean> {
    const base = Object.fromEntries(
        LAYER_DEFAULTS.map((l) => [l.id, l.visible])
    ) as Record<LayerId, boolean>;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return base;
        const parsed = JSON.parse(raw) as Partial<Record<LayerId, boolean>>;
        for (const [id, v] of Object.entries(parsed)) {
            if (id in base) base[id as LayerId] = v ?? false;
        }
        return base;
    } catch (e) {
        console.warn('[layerStore] kunne ikke lese synlighet:', e);
        return base;
    }
}

function saveVisibility(vis: Record<LayerId, boolean>) {
    try {
        const subset: Partial<Record<LayerId, boolean>> = {};
        for (const [id, v] of Object.entries(vis)) if (v) subset[id as LayerId] = true;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(subset));
    } catch {
        // ignore quota errors
    }
}

const INITIAL_STATUS: Record<LayerId, LayerStatus> = Object.fromEntries(
    LAYER_DEFAULTS.map((l) => [
        l.id,
        { loading: l.loading, count: l.count, error: l.error, lastUpdated: l.lastUpdated },
    ])
) as Record<LayerId, LayerStatus>;

const META: Record<LayerId, { name: string; color: string }> = Object.fromEntries(
    LAYER_DEFAULTS.map((l) => [l.id, { name: l.name, color: l.color }])
) as Record<LayerId, { name: string; color: string }>;

export const useLayerStore = create<LayerStoreState>((set, get) => ({
    visibility: loadVisibility(),
    status: INITIAL_STATUS,
    meta: META,
    actions: {
        toggleLayer: (id) =>
            set((state) => {
                const next = { ...state.visibility, [id]: !state.visibility[id] };
                saveVisibility(next);
                return { visibility: next };
            }),
        toggleCategory: (ids) =>
            set((state) => {
                const anyVisible = ids.some((id) => state.visibility[id]);
                const next = { ...state.visibility };
                for (const id of ids) next[id] = !anyVisible;
                saveVisibility(next);
                return { visibility: next };
            }),
        setVisibleLayers: (ids) =>
            set((state) => {
                const wanted = new Set(ids);
                const next = { ...state.visibility };
                // Behold alltid gates-synlighet (analyseverktøy, ikke en datascene).
                for (const def of LAYER_DEFAULTS) {
                    if (def.id === 'gates') continue;
                    next[def.id] = wanted.has(def.id);
                }
                saveVisibility(next);
                return { visibility: next };
            }),
        setLayerLoading: (id, loading) => {
            const cur = get().status[id];
            if (cur.loading === loading) return;
            set((state) => ({
                status: { ...state.status, [id]: { ...cur, loading } },
            }));
        },
        setLayerCount: (id, count) => {
            const cur = get().status[id];
            if (cur.count === count) return;
            set((state) => ({
                status: { ...state.status, [id]: { ...cur, count } },
            }));
        },
        setLayerError: (id, error) => {
            const cur = get().status[id];
            if (cur.error === error) return;
            set((state) => ({
                status: { ...state.status, [id]: { ...cur, error } },
            }));
        },
        setLayerLastUpdated: (id, ts) => {
            const cur = get().status[id];
            if (cur.lastUpdated === ts) return;
            set((state) => ({
                status: { ...state.status, [id]: { ...cur, lastUpdated: ts } },
            }));
        },
    },
}));

export const useLayerActions = () => useLayerStore((s) => s.actions);

export const useLayerVisibility = (id: LayerId): boolean =>
    useLayerStore((s) => s.visibility[id] ?? false);

export const useLayerStatus = (id: LayerId): LayerStatus =>
    useLayerStore(useShallow((s) => s.status[id]));

export const useLayerConfig = (id: LayerId): LayerConfig =>
    useLayerStore(
        useShallow((s) => ({
            id,
            name: s.meta[id].name,
            color: s.meta[id].color,
            visible: s.visibility[id] ?? false,
            ...s.status[id],
        }))
    );

export const useAllLayerVisibility = (): Record<LayerId, boolean> =>
    useLayerStore((s) => s.visibility);

export const useActiveLayerIds = (): LayerId[] =>
    useLayerStore(
        useShallow((s) => {
            const out: LayerId[] = [];
            for (const def of LAYER_DEFAULTS) {
                const st = s.status[def.id];
                if (s.visibility[def.id] && (st.count > 0 || st.loading || st.error)) {
                    out.push(def.id);
                }
            }
            return out;
        })
    );

export const useVisibleLayerIds = (): LayerId[] =>
    useLayerStore(
        useShallow((s) => {
            const out: LayerId[] = [];
            for (const def of LAYER_DEFAULTS) {
                if (s.visibility[def.id]) out.push(def.id);
            }
            return out;
        })
    );

export function getLayerConfigSnapshot(id: LayerId): LayerConfig {
    const s = useLayerStore.getState();
    return {
        id,
        name: s.meta[id].name,
        color: s.meta[id].color,
        visible: s.visibility[id] ?? false,
        ...s.status[id],
    };
}

export function getAllLayerConfigs(): LayerConfig[] {
    const s = useLayerStore.getState();
    return LAYER_DEFAULTS.map((def) => ({
        id: def.id,
        name: s.meta[def.id].name,
        color: s.meta[def.id].color,
        visible: s.visibility[def.id] ?? false,
        ...s.status[def.id],
    }));
}

export const useVisibleLayerCount = (): number =>
    useLayerStore(
        useShallow((s) => {
            let n = 0;
            for (const def of LAYER_DEFAULTS) if (s.visibility[def.id]) n++;
            return n;
        })
    );

export const useTotalObjectCount = (): number =>
    useLayerStore(
        useShallow((s) => {
            let total = 0;
            for (const def of LAYER_DEFAULTS) {
                if (s.visibility[def.id]) total += s.status[def.id].count;
            }
            return total;
        })
    );
