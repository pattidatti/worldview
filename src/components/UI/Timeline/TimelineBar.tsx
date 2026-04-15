import { useEffect, useRef, useState } from 'react';
import { useTimelineMode } from '@/context/TimelineModeContext';
import { addToast } from '@/components/UI/Toast';
import { ModePill } from './ModePill';
import { PlaybackControls } from './PlaybackControls';
import { TimelineDatePicker } from './DatePicker';
import { TimelineTrack } from './TimelineTrack';

const FLIGHT_BUCKET_MS = 10 * 60 * 1000;

export function TimelineBar() {
    const { mode, cursor, speed, setCursor, setSpeed, setMode, jumpToNow } = useTimelineMode();
    const [now, setNow] = useState(() => Date.now());
    const nowRef = useRef(now);
    nowRef.current = now;

    // Oppdater "nå"-grensen hvert sekund så vinduet glir til høyre i live.
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    // Onboarding-toast første gang bruker går til REPLAY.
    useEffect(() => {
        if (mode !== 'replay') return;
        try {
            const key = 'worldview-replay-onboarding-seen';
            if (localStorage.getItem(key)) return;
            localStorage.setItem(key, '1');
            addToast('Replay: dra i baren for å scrolle. Space = pause. Se ? for snarveier.', 'info');
        } catch { /* ignore */ }
    }, [mode]);

    // Keyboard shortcuts for tidslinjen.
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

            if (e.key === 'l' || e.key === 'L') {
                e.preventDefault();
                if (mode === 'live') {
                    setCursor(Date.now() - 30 * 60 * 1000);
                    setMode('replay');
                } else {
                    jumpToNow();
                }
                return;
            }
            if (e.key === 'Home') {
                e.preventDefault();
                jumpToNow();
                return;
            }
            if (mode !== 'replay') return;
            if (e.key === ' ' || e.code === 'Space') {
                e.preventDefault();
                // Toggle: hvis speed>0 → 0, ellers 120 (default).
                setSpeed(speed === 0 ? 120 : 0);
                return;
            }
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                setCursor(cursor - FLIGHT_BUCKET_MS);
                return;
            }
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                setCursor(cursor + FLIGHT_BUCKET_MS);
                return;
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [mode, cursor, speed, setCursor, setSpeed, setMode, jumpToNow]);

    return (
        <div
            className="fixed left-0 right-0 z-[11] flex items-center gap-3 px-4"
            style={{
                bottom: 36, // rett over StatusTicker (36px)
                height: 44,
                background: 'rgba(10,10,20,0.82)',
                backdropFilter: 'blur(10px)',
                borderTop: '1px solid rgba(255,255,255,0.08)',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                fontFamily: 'var(--font-mono)',
            }}
            data-mode={mode}
        >
            <ModePill />
            <TimelineTrack nowRef={nowRef} />
            <TimelineDatePicker />
            <PlaybackControls />
        </div>
    );
}
