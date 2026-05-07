import { createContext, useContext, useRef, useState, useCallback, type ReactNode, type MutableRefObject } from 'react';

interface CinematicContextValue {
    cinematicActive: boolean;
    cinematicActiveRef: MutableRefObject<boolean>;
    setCinematicActive: (active: boolean) => void;
}

const CinematicContext = createContext<CinematicContextValue | null>(null);

export function CinematicProvider({ children }: { children: ReactNode }) {
    const [cinematicActive, setCinematicActiveState] = useState(false);
    const cinematicActiveRef = useRef(false);

    const setCinematicActive = useCallback((active: boolean) => {
        cinematicActiveRef.current = active;
        setCinematicActiveState(active);
    }, []);

    return (
        <CinematicContext.Provider value={{ cinematicActive, cinematicActiveRef, setCinematicActive }}>
            {children}
        </CinematicContext.Provider>
    );
}

export function useCinematic(): CinematicContextValue {
    const ctx = useContext(CinematicContext);
    if (!ctx) throw new Error('useCinematic must be used within CinematicProvider');
    return ctx;
}
