import { useState, useEffect } from 'react';
import { type Viewer } from 'cesium';
import { viewportService, type Viewport } from '@/core/ViewportService';

// Re-eksport-shim: Viewport-typen og viewportToRect har bodd her siden fase 1
// og importeres av ~9 services + alle viewport-drevne lag. Kilden er nå
// ViewportService (src/core/ViewportService.ts).
export type { Viewport };
export { viewportToRect } from '@/core/ViewportService';

/**
 * Tynn React-wrapper over ViewportService: én delt camera.changed-lytter for
 * hele appen i stedet for én per hook-instans. Semantikken per kallsted er
 * uendret (per-subscriber debounce + zoom-relativ endringsterskel).
 */
export function useViewport(viewer: Viewer | null, debounceMs: number = 1000): Viewport | null {
    const [viewport, setViewport] = useState<Viewport | null>(null);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        return viewportService.subscribe(setViewport, debounceMs);
    }, [viewer, debounceMs]);

    return viewport;
}
