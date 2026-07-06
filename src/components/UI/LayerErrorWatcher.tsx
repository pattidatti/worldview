import { useEffect, useRef } from 'react';
import { useLayerStore } from '@/store/layerStore';
import { LAYER_DEFAULTS } from '@/types/layers';
import { addToast } from './Toast';

const NAME_BY_ID = Object.fromEntries(LAYER_DEFAULTS.map((l) => [l.id, l.name])) as Record<string, string>;

/**
 * Toaster nye lag-feil. Abonnerer på Zustand-storen utenfor React-render, så
 * komponentet re-rendrer aldri — uansett hvor mange statusendringer lag får.
 */
export function LayerErrorWatcher() {
    const prevRef = useRef<Record<string, string | null>>({});

    useEffect(() => {
        const check = (state: ReturnType<typeof useLayerStore.getState>) => {
            for (const [id, status] of Object.entries(state.status)) {
                const prev = prevRef.current[id];
                if (status.error && status.error !== prev) {
                    addToast(`${NAME_BY_ID[id] ?? id}: ${status.error}`);
                }
                prevRef.current[id] = status.error;
            }
        };
        check(useLayerStore.getState());
        return useLayerStore.subscribe(check);
    }, []);

    return null;
}
