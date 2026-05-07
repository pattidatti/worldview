import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
    type ReactNode,
} from 'react';

const NOOP_UNSUBSCRIBE = () => {};
const noopSubscribe = () => NOOP_UNSUBSCRIBE;

export type TimelineMode = 'live' | 'replay';

// Module-level cursor store — separert fra context slik at cursor-endringer
// ikke trigger re-render i alle context-abonnenter (28 lag + status-komponenter).
// Bare komponenter som kaller useCursor() re-rendrer ved cursor-oppdatering.
type CursorListener = () => void;
let _cursor = Date.now();
const _cursorListeners = new Set<CursorListener>();

const cursorStore = {
    get: () => _cursor,
    set: (v: number) => {
        _cursor = v;
        _cursorListeners.forEach((fn) => fn());
    },
    subscribe: (fn: CursorListener) => {
        _cursorListeners.add(fn);
        return () => _cursorListeners.delete(fn);
    },
};

export function useCursor(): number {
    return useSyncExternalStore(cursorStore.subscribe, cursorStore.get);
}

/** Direkte snapshot uten abonnement — for effekter som trenger cursor én gang. */
export function getCursorSnapshot(): number {
    return cursorStore.get();
}

/**
 * Som useCursor(), men abonnerer KUN når mode === 'replay'. I live-modus
 * returneres siste kjente cursor-verdi uten re-render-trigger. Brukes av
 * tunge Cesium-lag (FlightLayer/ShipLayer/SatelliteLayer) som ikke leser
 * cursor i live-grenen, men før dette re-rendret hvert sekund unødig.
 */
export function useReplayCursor(mode: TimelineMode): number {
    return useSyncExternalStore(
        mode === 'replay' ? cursorStore.subscribe : noopSubscribe,
        cursorStore.get,
    );
}

// Speed = sekunder per sekund sanntid. 0 = pause.
// 30 = 30m/s (0.5 timer/sekund), 120 = 2t/s, 360 = 6t/s.
export type TimelineSpeed = 0 | 30 | 120 | 360;

export const TIMELINE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24t synlig
export const REPLAY_DEFAULT_OFFSET_MS = 30 * 60 * 1000; // -30 min ved klikk på REPLAY
export const CURSOR_JUMP_THRESHOLD_MS = 15 * 60 * 1000; // 15 min = trail-reset

interface TimelineModeContextValue {
    mode: TimelineMode;
    speed: TimelineSpeed;
    setMode: (mode: TimelineMode) => void;
    setCursor: (ts: number) => void;
    setSpeed: (speed: TimelineSpeed) => void;
    jumpToNow: () => void;
    modeEpoch: number;
}

const TimelineModeContext = createContext<TimelineModeContextValue | null>(null);

export function TimelineModeProvider({ children }: { children: ReactNode }) {
    const [mode, setModeState] = useState<TimelineMode>('live');
    const [speed, setSpeed] = useState<TimelineSpeed>(120);
    const [modeEpoch, setModeEpoch] = useState(0);
    const modeRef = useRef<TimelineMode>('live');
    modeRef.current = mode;

    // Live: cursor-store oppdateres hvert sekund — ingen React state-endring,
    // så bare useCursor()-abonnenter re-rendrer (ikke hele context-treet).
    useEffect(() => {
        if (mode !== 'live') return;
        const id = setInterval(() => cursorStore.set(Date.now()), 1000);
        return () => clearInterval(id);
    }, [mode]);

    // Replay + speed>0: cursor beveger seg fremover via RAF.
    useEffect(() => {
        if (mode !== 'replay' || speed === 0) return;
        let rafId: number;
        let lastTick = performance.now();
        const tick = (now: number) => {
            const dt = (now - lastTick) / 1000;
            lastTick = now;
            const next = cursorStore.get() + dt * speed * 1000;
            const ceiling = Date.now() - 10_000;
            cursorStore.set(next > ceiling ? ceiling : next);
            rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafId);
    }, [mode, speed]);

    const setMode = useCallback((next: TimelineMode) => {
        setModeState((prev) => {
            if (prev === next) return prev;
            setModeEpoch((e) => e + 1);
            return next;
        });
    }, []);

    const setCursor = useCallback((ts: number) => {
        const now = Date.now();
        const floor = now - 30 * 24 * 60 * 60 * 1000;
        const ceiling = now - 10_000;
        cursorStore.set(Math.max(floor, Math.min(ceiling, ts)));
    }, []);

    const jumpToNow = useCallback(() => {
        setModeState((prev) => {
            if (prev !== 'live') {
                setModeEpoch((e) => e + 1);
            }
            return 'live';
        });
        cursorStore.set(Date.now());
    }, []);

    const value = useMemo<TimelineModeContextValue>(
        () => ({ mode, speed, setMode, setCursor, setSpeed, jumpToNow, modeEpoch }),
        [mode, speed, setMode, setCursor, setSpeed, jumpToNow, modeEpoch],
    );

    return (
        <TimelineModeContext.Provider value={value}>
            {children}
        </TimelineModeContext.Provider>
    );
}

export function useTimelineMode(): TimelineModeContextValue {
    const ctx = useContext(TimelineModeContext);
    if (!ctx) throw new Error('useTimelineMode må brukes inni TimelineModeProvider');
    return ctx;
}

// Backwards-compat shim — bruk heller useCursor() + useTimelineMode() separat.
export function useTimelineModeWithCursor(): TimelineModeContextValue & { cursor: number } {
    const ctx = useTimelineMode();
    const cursor = useCursor();
    return { ...ctx, cursor };
}
