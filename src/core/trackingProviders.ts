// Posisjons-providere for kamera-tracking av primitive-lag. GlobeViewers
// tracking-løype slår opp entiteter i dataSources (Entity-lag); primitives
// finnes ikke der, så renderplan-renderere registrerer en provider her som
// fallback (id = entitets-id uten kanal-prefiks, f.eks. icao24).

import type { Cartesian3 } from 'cesium';

export type PositionProvider = (entityId: string) => Cartesian3 | null;

const providers = new Set<PositionProvider>();

export const trackingProviders = {
    register(provider: PositionProvider): () => void {
        providers.add(provider);
        return () => providers.delete(provider);
    },

    /** Første provider som kjenner id-en vinner. */
    getPosition(entityId: string): Cartesian3 | null {
        for (const provider of providers) {
            const pos = provider(entityId);
            if (pos) return pos;
        }
        return null;
    },
};
