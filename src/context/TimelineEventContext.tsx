import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from 'react';
import {
    TIMELINE_EVENT_CAP,
    type TimelineEvent,
} from '@/types/timeline-event';

interface TimelineEventContextValue {
    events: TimelineEvent[];
    append: (events: TimelineEvent | TimelineEvent[]) => void;
    clear: () => void;
}

interface TimelineEventActions {
    append: (events: TimelineEvent | TimelineEvent[]) => void;
    clear: () => void;
}

const TimelineEventContext = createContext<TimelineEventContextValue | null>(null);
// Egen context for actions med stabil identitet: produsenter (FlightLayer,
// ShipLayer, useReplayEntities) som bare trenger append skal IKKE re-rendre
// hver gang events-køen endres.
const TimelineEventActionsContext = createContext<TimelineEventActions | null>(null);

export function TimelineEventProvider({ children }: { children: ReactNode }) {
    const [events, setEvents] = useState<TimelineEvent[]>([]);

    const append = useCallback((incoming: TimelineEvent | TimelineEvent[]) => {
        const batch = Array.isArray(incoming) ? incoming : [incoming];
        if (batch.length === 0) return;

        setEvents((prev) => {
            const seen = new Set(prev.map((e) => e.id));
            const fresh = batch.filter((e) => !seen.has(e.id));
            if (fresh.length === 0) return prev;

            const combined = [...prev, ...fresh];
            if (combined.length <= TIMELINE_EVENT_CAP) return combined;

            return combined.slice(combined.length - TIMELINE_EVENT_CAP);
        });
    }, []);

    const clear = useCallback(() => setEvents([]), []);

    const actions = useMemo(() => ({ append, clear }), [append, clear]);

    const value = useMemo(
        () => ({ events, append, clear }),
        [events, append, clear],
    );

    return (
        <TimelineEventActionsContext.Provider value={actions}>
            <TimelineEventContext.Provider value={value}>
                {children}
            </TimelineEventContext.Provider>
        </TimelineEventActionsContext.Provider>
    );
}

/** Full tilgang inkl. events-køen — re-rendrer ved hvert append. For lesere (GatePanel, EventMarkers). */
export function useTimelineEvents() {
    const ctx = useContext(TimelineEventContext);
    if (!ctx) {
        throw new Error('useTimelineEvents must be used within TimelineEventProvider');
    }
    return ctx;
}

/** Kun append/clear med stabil identitet — re-rendrer ALDRI ved kø-endringer. For produsenter. */
export function useTimelineEventActions(): TimelineEventActions {
    const ctx = useContext(TimelineEventActionsContext);
    if (!ctx) {
        throw new Error('useTimelineEventActions must be used within TimelineEventProvider');
    }
    return ctx;
}
