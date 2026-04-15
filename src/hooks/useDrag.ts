import { useCallback, useEffect, useRef, useState } from 'react';

export interface DragPosition {
    x: number;
    y: number;
}

interface DragStart {
    startX: number;
    startY: number;
    pointerX: number;
    pointerY: number;
}

interface UseDragOptions {
    initial: DragPosition;
    onEnd?: (pos: DragPosition) => void;
    panelWidth?: number;
    panelHeight?: number;
}

export function useDrag({ initial, onEnd, panelWidth = 280, panelHeight = 120 }: UseDragOptions) {
    const [position, setPosition] = useState<DragPosition>(initial);
    const startRef = useRef<DragStart | null>(null);

    const clamp = useCallback(
        (p: DragPosition): DragPosition => {
            const maxX = Math.max(0, window.innerWidth - panelWidth);
            const maxY = Math.max(0, window.innerHeight - panelHeight);
            return {
                x: Math.max(0, Math.min(maxX, p.x)),
                y: Math.max(0, Math.min(maxY, p.y)),
            };
        },
        [panelWidth, panelHeight],
    );

    useEffect(() => {
        const handler = () => setPosition((p) => clamp(p));
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    }, [clamp]);

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault();
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        startRef.current = {
            startX: position.x,
            startY: position.y,
            pointerX: e.clientX,
            pointerY: e.clientY,
        };
    }, [position.x, position.y]);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        const s = startRef.current;
        if (!s) return;
        const dx = e.clientX - s.pointerX;
        const dy = e.clientY - s.pointerY;
        setPosition(clamp({ x: s.startX + dx, y: s.startY + dy }));
    }, [clamp]);

    const onPointerUp = useCallback((e: React.PointerEvent) => {
        if (!startRef.current) return;
        startRef.current = null;
        try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch { /* */ }
        onEnd?.(position);
    }, [position, onEnd]);

    return {
        position,
        setPosition,
        bind: { onPointerDown, onPointerMove, onPointerUp },
    };
}
