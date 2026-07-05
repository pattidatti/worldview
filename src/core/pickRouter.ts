// Prefiks-basert ruting av primitive-picks. Primitives fyrer IKKE Cesiums
// selectedEntityChanged — de plukkes som string-id-er i GlobeViewers
// LEFT_CLICK-handler (samme seam som SatelliteLayers orbital-shell-prior-art)
// og rutes hit. Renderere/lag-shims registrerer sitt kanal-prefiks.

export interface PickScreenPos {
    x: number;
    y: number;
}

/** Returner true hvis picket ble håndtert (stopper videre klikk-behandling). */
type PickHandler = (id: string, screenPos: PickScreenPos) => boolean;

const handlers = new Map<string, PickHandler>();

export const pickRouter = {
    /** Registrer handler for id-er som starter med `prefix` (f.eks. 'flight:'). */
    register(prefix: string, handler: PickHandler): () => void {
        handlers.set(prefix, handler);
        return () => {
            if (handlers.get(prefix) === handler) handlers.delete(prefix);
        };
    },

    /** Rut en picked string-id. Returnerer true hvis en handler tok den. */
    route(pickedId: unknown, screenPos: PickScreenPos): boolean {
        if (typeof pickedId !== 'string') return false;
        for (const [prefix, handler] of handlers) {
            if (pickedId.startsWith(prefix)) {
                return handler(pickedId, screenPos);
            }
        }
        return false;
    },

    /** Test-hook. */
    _clear(): void {
        handlers.clear();
    },
};
