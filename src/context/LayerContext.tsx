import { useMemo } from 'react';
import { type LayerId, type LayerConfig, LAYER_DEFAULTS } from '@/types/layers';
import {
    useLayerStore,
    useLayerActions,
    useLayerVisibility as useLayerVisibilityStore,
} from '@/store/layerStore';
import { useShallow } from 'zustand/react/shallow';

interface LayerContextValue {
    layers: LayerConfig[];
    toggleLayer: (id: LayerId) => void;
    toggleCategory: (layerIds: LayerId[]) => void;
    setLayerLoading: (id: LayerId, loading: boolean) => void;
    setLayerCount: (id: LayerId, count: number) => void;
    setLayerError: (id: LayerId, error: string | null) => void;
    setLayerLastUpdated: (id: LayerId, timestamp: number | null) => void;
    isVisible: (id: LayerId) => boolean;
}

/**
 * Bakoverkompatibelt API for komponenter som enda ikke er migrert til granulære
 * selektorer. Nye kall bør bruke `useLayerVisibility(id)`, `useLayerStatus(id)` og
 * `useLayerActions()` fra `@/store/layerStore` for å unngå re-render-kaskader.
 */
export function useLayers(): LayerContextValue {
    const visibility = useLayerStore((s) => s.visibility);
    const status = useLayerStore(useShallow((s) => s.status));
    const meta = useLayerStore((s) => s.meta);
    const actions = useLayerActions();

    const layers = useMemo<LayerConfig[]>(
        () =>
            LAYER_DEFAULTS.map((def) => ({
                id: def.id,
                name: meta[def.id].name,
                color: meta[def.id].color,
                visible: visibility[def.id] ?? false,
                ...status[def.id],
            })),
        [visibility, status, meta]
    );

    return {
        layers,
        toggleLayer: actions.toggleLayer,
        toggleCategory: actions.toggleCategory,
        setLayerLoading: actions.setLayerLoading,
        setLayerCount: actions.setLayerCount,
        setLayerError: actions.setLayerError,
        setLayerLastUpdated: actions.setLayerLastUpdated,
        isVisible: (id: LayerId) => visibility[id] ?? false,
    };
}

// Re-eksporter granulær selektor for call sites som importerer fra denne filen.
export { useLayerVisibilityStore as useLayerVisibility };
