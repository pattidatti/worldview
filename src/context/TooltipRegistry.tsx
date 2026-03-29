import { createContext, useContext, useRef, useCallback, type ReactNode } from 'react';
import { type Entity } from 'cesium';
import { type TooltipContent } from '@/types/tooltip';

type TooltipBuilder = (entity: Entity) => TooltipContent | null;

interface TooltipRegistryValue {
    register: (dataSourceName: string, builder: TooltipBuilder) => void;
    unregister: (dataSourceName: string) => void;
    resolve: (entity: Entity) => TooltipContent | null;
}

const TooltipRegistryContext = createContext<TooltipRegistryValue | null>(null);

export function TooltipRegistryProvider({ children }: { children: ReactNode }) {
    const buildersRef = useRef(new Map<string, TooltipBuilder>());

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

    return (
        <TooltipRegistryContext.Provider value={{ register, unregister, resolve }}>
            {children}
        </TooltipRegistryContext.Provider>
    );
}

export function useTooltipRegistry() {
    const ctx = useContext(TooltipRegistryContext);
    if (!ctx) throw new Error('useTooltipRegistry must be used within TooltipRegistryProvider');
    return ctx;
}
