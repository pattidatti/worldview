import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';

export type TimelineMode = 'live' | 'replay';

// Speed = sekunder per sekund sanntid. 0 = pause.
// 30 = 30m/s (0.5 timer/sekund), 120 = 2t/s, 360 = 6t/s.
export type TimelineSpeed = 0 | 30 | 120 | 360;

export const TIMELINE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24t synlig
export const REPLAY_DEFAULT_OFFSET_MS = 30 * 60 * 1000; // -30 min ved klikk på REPLAY
export const CURSOR_JUMP_THRESHOLD_MS = 15 * 60 * 1000; // 15 min = trail-reset

interface TimelineModeContextValue {
    mode: TimelineMode;
    cursor: number; // epoch ms. I live: Date.now() (oppdateres hvert sekund). I replay: user-styrt.
    speed: TimelineSpeed;
    setMode: (mode: TimelineMode) => void;
    setCursor: (ts: number) => void;
    setSpeed: (speed: TimelineSpeed) => void;
    jumpToNow: () => void;
    // Mode-switch-teller: øker hver gang mode bytter. Lag kan se på dette for å nullstille trails.
    modeEpoch: number;
}

const TimelineModeContext = createContext<TimelineModeContextValue | null>(null);

export function TimelineModeProvider({ children }: { children: ReactNode }) {
    const [mode, setModeState] = useState<TimelineMode>('live');
    const [cursor, setCursorState] = useState<number>(() => Date.now());
    const [speed, setSpeed] = useState<TimelineSpeed>(120);
    const [modeEpoch, setModeEpoch] = useState(0);
    const modeRef = useRef<TimelineMode>('live');
    modeRef.current = mode;

    // Live: cursor følger Date.now() (oppdateres hvert sekund).
    useEffect(() => {
        if (mode !== 'live') return;
        const id = setInterval(() => setCursorState(Date.now()), 1000);
        return () => clearInterval(id);
    }, [mode]);

    // Replay + speed>0: cursor beveger seg fremover automatisk.
    useEffect(() => {
        if (mode !== 'replay' || speed === 0) return;
        let rafId: number;
        let lastTick = performance.now();
        const tick = (now: number) => {
            const dt = (now - lastTick) / 1000; // sekunder
            lastTick = now;
            setCursorState((prev) => {
                const next = prev + dt * speed * 1000;
                // Klem til nå - 10s (minsteavstand fra live-edge for å unngå tom bucket).
                const ceiling = Date.now() - 10_000;
                return next > ceiling ? ceiling : next;
            });
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
        // Klem til range [now - 30d, now - 10s].
        const now = Date.now();
        const floor = now - 30 * 24 * 60 * 60 * 1000;
        const ceiling = now - 10_000;
        const clamped = Math.max(floor, Math.min(ceiling, ts));
        setCursorState(clamped);
    }, []);

    const jumpToNow = useCallback(() => {
        setModeState((prev) => {
            if (prev !== 'live') {
                setModeEpoch((e) => e + 1);
            }
            return 'live';
        });
        setCursorState(Date.now());
    }, []);

    const value = useMemo<TimelineModeContextValue>(
        () => ({ mode, cursor, speed, setMode, setCursor, setSpeed, jumpToNow, modeEpoch }),
        [mode, cursor, speed, setMode, setCursor, setSpeed, jumpToNow, modeEpoch],
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
