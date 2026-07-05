import { createContext, useContext, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { type Entity } from 'cesium';
import { type PopupContent } from '@/types/popup';

type PopupBuilder = (entity: Entity) => PopupContent | null;
/** Primitive-lag (renderplanet): builder får string-id og slår opp i EntityStore. */
type PopupByIdBuilder = (id: string) => PopupContent | null;

interface PopupRegistryValue {
    register: (dataSourceName: string, builder: PopupBuilder) => void;
    unregister: (dataSourceName: string) => void;
    resolve: (entity: Entity) => PopupContent | null;
    /** Registrer builder for primitive-picks med id-er som starter med `prefix` (f.eks. 'flight:'). */
    registerById: (prefix: string, builder: PopupByIdBuilder) => void;
    unregisterById: (prefix: string) => void;
    resolveById: (pickedId: string) => PopupContent | null;
}

const PopupRegistryContext = createContext<PopupRegistryValue | null>(null);

export function PopupRegistryProvider({ children }: { children: ReactNode }) {
    const buildersRef = useRef(new Map<string, PopupBuilder>());
    const byIdBuildersRef = useRef(new Map<string, PopupByIdBuilder>());

    const register = useCallback((dataSourceName: string, builder: PopupBuilder) => {
        buildersRef.current.set(dataSourceName, builder);
    }, []);

    const unregister = useCallback((dataSourceName: string) => {
        buildersRef.current.delete(dataSourceName);
    }, []);

    const resolve = useCallback((entity: Entity): PopupContent | null => {
        for (const [, builder] of buildersRef.current) {
            const result = builder(entity);
            if (result) return result;
        }
        return null;
    }, []);

    const registerById = useCallback((prefix: string, builder: PopupByIdBuilder) => {
        byIdBuildersRef.current.set(prefix, builder);
    }, []);

    const unregisterById = useCallback((prefix: string) => {
        byIdBuildersRef.current.delete(prefix);
    }, []);

    const resolveById = useCallback((pickedId: string): PopupContent | null => {
        for (const [prefix, builder] of byIdBuildersRef.current) {
            if (pickedId.startsWith(prefix)) {
                const result = builder(pickedId);
                if (result) return result;
            }
        }
        return null;
    }, []);

    const value = useMemo(
        () => ({ register, unregister, resolve, registerById, unregisterById, resolveById }),
        [register, unregister, resolve, registerById, unregisterById, resolveById],
    );
    return (
        <PopupRegistryContext.Provider value={value}>
            {children}
        </PopupRegistryContext.Provider>
    );
}

export function usePopupRegistry() {
    const ctx = useContext(PopupRegistryContext);
    if (!ctx) throw new Error('usePopupRegistry must be used within PopupRegistryProvider');
    return ctx;
}
