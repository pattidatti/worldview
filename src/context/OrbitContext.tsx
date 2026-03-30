import { createContext, useContext, useState, type ReactNode } from 'react';

interface OrbitContextValue {
    orbitActive: boolean;
    setOrbitActive: (active: boolean) => void;
}

const OrbitContext = createContext<OrbitContextValue | null>(null);

export function OrbitProvider({ children }: { children: ReactNode }) {
    const [orbitActive, setOrbitActive] = useState(false);
    return (
        <OrbitContext.Provider value={{ orbitActive, setOrbitActive }}>
            {children}
        </OrbitContext.Provider>
    );
}

export function useOrbit(): OrbitContextValue {
    const ctx = useContext(OrbitContext);
    if (!ctx) throw new Error('useOrbit must be used within OrbitProvider');
    return ctx;
}
