import { useState, useEffect, useRef } from 'react';

interface AnimatedCountProps {
    value: number;
    color?: string;
    flashColor?: string;
    className?: string;
    title?: string;
}

function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
}

export function AnimatedCount({ value, color, flashColor = 'var(--accent-green)', className, title }: AnimatedCountProps) {
    const [displayed, setDisplayed] = useState(value);
    const [flashing, setFlashing] = useState(false);
    const prevRef = useRef(value);
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        if (value === prevRef.current) return;

        const from = prevRef.current;
        const to = value;
        prevRef.current = value;

        setFlashing(true);
        const flashTimer = setTimeout(() => setFlashing(false), 450);

        const duration = 500;
        const startTime = performance.now();

        function tick(now: number) {
            const elapsed = now - startTime;
            const t = Math.min(elapsed / duration, 1);
            const eased = easeOutCubic(t);
            setDisplayed(Math.round(from + (to - from) * eased));
            if (t < 1) {
                rafRef.current = requestAnimationFrame(tick);
            }
        }

        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(tick);

        return () => {
            clearTimeout(flashTimer);
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        };
    }, [value]);

    return (
        <span
            className={className}
            title={title}
            style={{
                color: flashing ? flashColor : color,
                transition: 'color 0.45s ease-out',
            }}
        >
            {displayed.toLocaleString('nb-NO')}
        </span>
    );
}
