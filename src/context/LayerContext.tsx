import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { type LayerId, type LayerConfig, LAYER_DEFAULTS } from '@/types/layers';

interface LayerContextValue {
    layers: LayerConfig[];
    toggleLayer: (id: LayerId) => void;
    setLayerLoading: (id: LayerId, loading: boolean) => void;
    setLayerCount: (id: LayerId, count: number) => void;
    setLayerError: (id: LayerId, error: string | null) => void;
    setLayerLastUpdated: (id: LayerId, timestamp: number | null) => void;
    isVisible: (id: LayerId) => boolean;
}

const LayerContext = createContext<LayerContextValue | null>(null);

const STORAGE_KEY = 'worldview-layer-visibility';

function loadVisibility(): Partial<Record<LayerId, boolean>> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function saveVisibility(layers: LayerConfig[]) {
    const vis: Partial<Record<LayerId, boolean>> = {};
    layers.forEach((l) => { if (l.visible) vis[l.id] = true; });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(vis));
}

export function LayerProvider({ children }: { children: ReactNode }) {
    const [layers, setLayers] = useState<LayerConfig[]>(() => {
        const saved = loadVisibility();
        return LAYER_DEFAULTS.map((l) => ({ ...l, visible: saved[l.id] ?? l.visible }));
    });

    const toggleLayer = useCallback((id: LayerId) => {
        setLayers((prev) => {
            const next = prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l));
            saveVisibility(next);
            return next;
        });
    }, []);

    const setLayerLoading = useCallback((id: LayerId, loading: boolean) => {
        setLayers((prev) =>
            prev.map((l) => (l.id === id ? { ...l, loading } : l))
        );
    }, []);

    const setLayerCount = useCallback((id: LayerId, count: number) => {
        setLayers((prev) =>
            prev.map((l) => (l.id === id ? { ...l, count } : l))
        );
    }, []);

    const setLayerError = useCallback((id: LayerId, error: string | null) => {
        setLayers((prev) =>
            prev.map((l) => (l.id === id ? { ...l, error } : l))
        );
    }, []);

    const setLayerLastUpdated = useCallback((id: LayerId, timestamp: number | null) => {
        setLayers((prev) =>
            prev.map((l) => (l.id === id ? { ...l, lastUpdated: timestamp } : l))
        );
    }, []);

    const isVisible = useCallback(
        (id: LayerId) => layers.find((l) => l.id === id)?.visible ?? false,
        [layers]
    );

    return (
        <LayerContext.Provider
            value={{ layers, toggleLayer, setLayerLoading, setLayerCount, setLayerError, setLayerLastUpdated, isVisible }}
        >
            {children}
        </LayerContext.Provider>
    );
}

export function useLayers() {
    const ctx = useContext(LayerContext);
    if (!ctx) throw new Error('useLayers must be used within LayerProvider');
    return ctx;
}
