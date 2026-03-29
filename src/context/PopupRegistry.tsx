import { createContext, useContext, useRef, useCallback, type ReactNode } from 'react';
import { type Entity } from 'cesium';
import { type PopupContent } from '@/types/popup';

type PopupBuilder = (entity: Entity) => PopupContent | null;

interface PopupRegistryValue {
    register: (dataSourceName: string, builder: PopupBuilder) => void;
    unregister: (dataSourceName: string) => void;
    resolve: (entity: Entity) => PopupContent | null;
}

const PopupRegistryContext = createContext<PopupRegistryValue | null>(null);

export function PopupRegistryProvider({ children }: { children: ReactNode }) {
    const buildersRef = useRef(new Map<string, PopupBuilder>());

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

    return (
        <PopupRegistryContext.Provider value={{ register, unregister, resolve }}>
            {children}
        </PopupRegistryContext.Provider>
    );
}

export function usePopupRegistry() {
    const ctx = useContext(PopupRegistryContext);
    if (!ctx) throw new Error('usePopupRegistry must be used within PopupRegistryProvider');
    return ctx;
}
