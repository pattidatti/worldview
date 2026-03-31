import { createContext, useContext, useRef, useCallback, type ReactNode } from 'react';
import { type GeointLayerData } from '@/types/geoint';

type GeointDataFn = () => GeointLayerData | null;

interface GeointContextValue {
    register: (id: string, fn: GeointDataFn) => void;
    unregister: (id: string) => void;
    collect: () => GeointLayerData[];
}

const GeointContext = createContext<GeointContextValue | null>(null);

export function GeointProvider({ children }: { children: ReactNode }) {
    const providersRef = useRef(new Map<string, GeointDataFn>());

    const register = useCallback((id: string, fn: GeointDataFn) => {
        providersRef.current.set(id, fn);
    }, []);

    const unregister = useCallback((id: string) => {
        providersRef.current.delete(id);
    }, []);

    const collect = useCallback((): GeointLayerData[] => {
        const results: GeointLayerData[] = [];
        for (const [, fn] of providersRef.current) {
            const data = fn();
            if (data) results.push(data);
        }
        return results;
    }, []);

    return (
        <GeointContext.Provider value={{ register, unregister, collect }}>
            {children}
        </GeointContext.Provider>
    );
}

export function useGeointRegistry() {
    const ctx = useContext(GeointContext);
    if (!ctx) throw new Error('useGeointRegistry must be used within GeointProvider');
    return ctx;
}
