import { useEffect, useRef } from 'react';
import { useLayers } from '@/context/LayerContext';
import { addToast } from './Toast';

export function LayerErrorWatcher() {
    const { layers } = useLayers();
    const prevRef = useRef<Record<string, string | null>>({});

    useEffect(() => {
        for (const layer of layers) {
            const prev = prevRef.current[layer.id];
            if (layer.error && layer.error !== prev) {
                addToast(`${layer.name}: ${layer.error}`);
            }
            prevRef.current[layer.id] = layer.error;
        }
    }, [layers]);

    return null;
}
