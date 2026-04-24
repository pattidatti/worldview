import { useMemo, type ReactNode } from 'react';
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

// Provider beholdes som no-op wrapper for ryggelengdskompatibilitet med App.tsx.
export function LayerProvider({ children }: { children: ReactNode }) {
    return <>{children}</>;
}

/**
 * Ryggelengds-API for eksisterende komponenter. Nye komponenter bør bruke
 * granulære selektorer (useLayerVisibility, useLayerStatus, useActiveLayerIds) fra
 * `@/store/layerStore` for å unngå unødvendige re-renders.
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

// Re-eksporter granulære selektorer for nye call sites.
export { useLayerVisibilityStore as useLayerVisibility };
