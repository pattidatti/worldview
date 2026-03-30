import { useState, useEffect, useRef } from 'react';

interface AnimatedCountProps {
    value: number;
    color?: string;
    flashColor?: string;
    className?: string;
    title?: string;
}

export function AnimatedCount({ value, color, flashColor = 'var(--accent-green)', className, title }: AnimatedCountProps) {
    const [flashing, setFlashing] = useState(false);
    const prevRef = useRef(value);

    useEffect(() => {
        if (value !== prevRef.current) {
            prevRef.current = value;
            setFlashing(true);
            const t = setTimeout(() => setFlashing(false), 450);
            return () => clearTimeout(t);
        }
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
            {value.toLocaleString('nb-NO')}
        </span>
    );
}
