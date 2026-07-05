import { createContext, useContext, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { type Entity } from 'cesium';
import { type TooltipContent } from '@/types/tooltip';

type TooltipBuilder = (entity: Entity) => TooltipContent | null;
/** Primitive-lag (renderplanet): builder får string-id og slår opp i EntityStore. */
type TooltipByIdBuilder = (id: string) => TooltipContent | null;

interface TooltipRegistryValue {
    register: (dataSourceName: string, builder: TooltipBuilder) => void;
    unregister: (dataSourceName: string) => void;
    resolve: (entity: Entity) => TooltipContent | null;
    /** Registrer builder for primitive-hover med id-er som starter med `prefix`. */
    registerById: (prefix: string, builder: TooltipByIdBuilder) => void;
    unregisterById: (prefix: string) => void;
    resolveById: (pickedId: string) => TooltipContent | null;
}

const TooltipRegistryContext = createContext<TooltipRegistryValue | null>(null);

export function TooltipRegistryProvider({ children }: { children: ReactNode }) {
    const buildersRef = useRef(new Map<string, TooltipBuilder>());
    const byIdBuildersRef = useRef(new Map<string, TooltipByIdBuilder>());

    const register = useCallback((dataSourceName: string, builder: TooltipBuilder) => {
        buildersRef.current.set(dataSourceName, builder);
    }, []);

    const unregister = useCallback((dataSourceName: string) => {
        buildersRef.current.delete(dataSourceName);
    }, []);

    const resolve = useCallback((entity: Entity): TooltipContent | null => {
        for (const [, builder] of buildersRef.current) {
            const result = builder(entity);
            if (result) return result;
        }
        return null;
    }, []);

    const registerById = useCallback((prefix: string, builder: TooltipByIdBuilder) => {
        byIdBuildersRef.current.set(prefix, builder);
    }, []);

    const unregisterById = useCallback((prefix: string) => {
        byIdBuildersRef.current.delete(prefix);
    }, []);

    const resolveById = useCallback((pickedId: string): TooltipContent | null => {
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
        <TooltipRegistryContext.Provider value={value}>
            {children}
        </TooltipRegistryContext.Provider>
    );
}

export function useTooltipRegistry() {
    const ctx = useContext(TooltipRegistryContext);
    if (!ctx) throw new Error('useTooltipRegistry must be used within TooltipRegistryProvider');
    return ctx;
}
