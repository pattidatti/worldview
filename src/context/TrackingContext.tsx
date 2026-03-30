import { createContext, useContext, useState, type ReactNode } from 'react';

interface TrackingContextValue {
    trackedEntityId: string | null;
    setTrackedEntityId: (id: string | null) => void;
}

const TrackingContext = createContext<TrackingContextValue | null>(null);

export function TrackingProvider({ children }: { children: ReactNode }) {
    const [trackedEntityId, setTrackedEntityId] = useState<string | null>(null);
    return (
        <TrackingContext.Provider value={{ trackedEntityId, setTrackedEntityId }}>
            {children}
        </TrackingContext.Provider>
    );
}

export function useTracking(): TrackingContextValue {
    const ctx = useContext(TrackingContext);
    if (!ctx) throw new Error('useTracking must be used within TrackingProvider');
    return ctx;
}
