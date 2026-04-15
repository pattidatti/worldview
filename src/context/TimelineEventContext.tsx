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

const TimelineEventContext = createContext<TimelineEventContextValue | null>(null);

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

    const value = useMemo(
        () => ({ events, append, clear }),
        [events, append, clear],
    );

    return (
        <TimelineEventContext.Provider value={value}>
            {children}
        </TimelineEventContext.Provider>
    );
}

export function useTimelineEvents() {
    const ctx = useContext(TimelineEventContext);
    if (!ctx) {
        throw new Error('useTimelineEvents must be used within TimelineEventProvider');
    }
    return ctx;
}
