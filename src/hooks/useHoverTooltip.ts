import { useState, useEffect, useRef } from 'react';
import {
    Viewer,
    ScreenSpaceEventHandler,
    ScreenSpaceEventType,
    Cartesian2,
    Entity,
    defined,
} from 'cesium';
import { type TooltipContent } from '@/types/tooltip';

export interface HoverState {
    content: TooltipContent;
    x: number;
    y: number;
}

export function useHoverTooltip(
    viewer: Viewer | null,
    resolve: (entity: Entity) => TooltipContent | null,
): HoverState | null {
    const [hover, setHover] = useState<HoverState | null>(null);
    const resolveRef = useRef(resolve);
    resolveRef.current = resolve;
    const lastEntityIdRef = useRef<string | null>(null);
    const lastContentRef = useRef<TooltipContent | null>(null);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;

        const handler = new ScreenSpaceEventHandler(viewer.canvas);
        let lastPickTime = 0;
        const THROTTLE_MS = 50;

        handler.setInputAction((movement: { endPosition: Cartesian2 }) => {
            const now = performance.now();
            if (now - lastPickTime < THROTTLE_MS) return;
            lastPickTime = now;

            const { endPosition } = movement;
            const picked = viewer.scene.pick(endPosition);

            if (defined(picked) && picked.id instanceof Entity) {
                const entity = picked.id as Entity;
                const entityId = entity.id;

                if (entityId === lastEntityIdRef.current && lastContentRef.current) {
                    setHover({ content: lastContentRef.current, x: endPosition.x, y: endPosition.y });
                    return;
                }

                const content = resolveRef.current(entity);
                if (content) {
                    lastEntityIdRef.current = entityId;
                    lastContentRef.current = content;
                    viewer.canvas.style.cursor = 'pointer';
                    setHover({ content, x: endPosition.x, y: endPosition.y });
                } else {
                    lastEntityIdRef.current = null;
                    lastContentRef.current = null;
                    viewer.canvas.style.cursor = 'default';
                    setHover(null);
                }
            } else {
                if (lastEntityIdRef.current !== null) {
                    lastEntityIdRef.current = null;
                    lastContentRef.current = null;
                    viewer.canvas.style.cursor = 'default';
                    setHover(null);
                }
            }
        }, ScreenSpaceEventType.MOUSE_MOVE);

        return () => {
            if (!handler.isDestroyed()) handler.destroy();
            if (viewer && !viewer.isDestroyed()) {
                viewer.canvas.style.cursor = 'default';
            }
            lastEntityIdRef.current = null;
            lastContentRef.current = null;
        };
    }, [viewer]);

    return hover;
}
