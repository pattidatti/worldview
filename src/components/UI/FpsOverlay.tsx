import { useEffect, useRef, useState } from 'react';

/**
 * Lett FPS+ms/frame-teller. Toggles med F-tast (default skjult).
 * Bruker requestAnimationFrame for å måle reell frame-rate.
 */
export function FpsOverlay() {
    const [visible, setVisible] = useState(false);
    const [fps, setFps] = useState(0);
    const [ms, setMs] = useState(0);
    const rafRef = useRef<number | null>(null);
    const lastTimeRef = useRef(performance.now());
    const framesRef = useRef(0);
    const accumMsRef = useRef(0);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            // Ignorer hvis bruker skriver i et input/textarea
            const tag = (e.target as HTMLElement | null)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                setVisible((v) => !v);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    useEffect(() => {
        if (!visible) return;
        const tick = () => {
            const now = performance.now();
            const dt = now - lastTimeRef.current;
            lastTimeRef.current = now;
            framesRef.current += 1;
            accumMsRef.current += dt;
            if (accumMsRef.current >= 500) {
                setFps(Math.round((framesRef.current * 1000) / accumMsRef.current));
                setMs(Math.round((accumMsRef.current / framesRef.current) * 10) / 10);
                framesRef.current = 0;
                accumMsRef.current = 0;
            }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        };
    }, [visible]);

    if (!visible) return null;

    const color = fps >= 50 ? '#00ff88' : fps >= 30 ? '#ffaa00' : '#ff4466';
    return (
        <div
            className="fixed top-2 right-2 z-50 px-2 py-1 font-mono text-xs rounded border pointer-events-none"
            style={{
                backgroundColor: 'rgba(0,0,0,0.75)',
                borderColor: color,
                color,
                minWidth: 90,
            }}
        >
            <div>{fps} FPS</div>
            <div style={{ fontSize: 10, opacity: 0.8 }}>{ms} ms/frame</div>
        </div>
    );
}
