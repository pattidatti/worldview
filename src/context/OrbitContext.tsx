import { createContext, useContext, useState, type ReactNode } from 'react';

interface OrbitContextValue {
    orbitActive: boolean;
    setOrbitActive: (active: boolean) => void;
    orbitSpeed: number;
    setOrbitSpeed: (speed: number) => void;
}

const OrbitContext = createContext<OrbitContextValue | null>(null);

export function OrbitProvider({ children }: { children: ReactNode }) {
    const [orbitActive, setOrbitActive] = useState(false);
    const [orbitSpeed, setOrbitSpeed] = useState(0.003);
    return (
        <OrbitContext.Provider value={{ orbitActive, setOrbitActive, orbitSpeed, setOrbitSpeed }}>
            {children}
        </OrbitContext.Provider>
    );
}

export function useOrbit(): OrbitContextValue {
    const ctx = useContext(OrbitContext);
    if (!ctx) throw new Error('useOrbit must be used within OrbitProvider');
    return ctx;
}
