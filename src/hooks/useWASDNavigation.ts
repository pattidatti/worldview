import { useEffect, useRef } from 'react';
import { Cartesian3, type Viewer } from 'cesium';

const SPEED_FACTOR = 3e-9;  // rad per meter altitude per frame
const FRICTION = 0.85;       // momentum-friksjon (lik zoom-systemet)
const ACCELERATION = 0.12;   // lerp mot målhastighet
const MIN_VELOCITY = 1e-9;   // stopp-terskel

const WASD_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright']);

export function useWASDNavigation(viewer: Viewer | null, orbitActive: boolean) {
    const keysRef = useRef<Set<string>>(new Set());
    const velRef = useRef({ lon: 0, lat: 0 });
    const loopActiveRef = useRef(false);
    const orbitActiveRef = useRef(orbitActive);
    orbitActiveRef.current = orbitActive;

    useEffect(() => {
        if (!viewer) return;

        const isTyping = () => {
            const active = document.activeElement;
            return (
                active instanceof HTMLInputElement ||
                active instanceof HTMLTextAreaElement ||
                (active instanceof HTMLElement && active.isContentEditable)
            );
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (isTyping()) return;
            const key = e.key.toLowerCase();
            if (!WASD_KEYS.has(key)) return;
            e.preventDefault();
            keysRef.current.add(key);
            if (!loopActiveRef.current) {
                loopActiveRef.current = true;
                viewer.scene.requestRender();
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            keysRef.current.delete(e.key.toLowerCase());
        };

        const handleBlur = () => {
            keysRef.current.clear();
        };

        const handlePreRender = () => {
            if (orbitActiveRef.current) return;

            const keys = keysRef.current;
            const vel = velRef.current;
            const camera = viewer.camera;

            const right = (keys.has('d') || keys.has('arrowright') ? 1 : 0)
                        - (keys.has('a') || keys.has('arrowleft')  ? 1 : 0);
            const fwd   = (keys.has('w') || keys.has('arrowup')    ? 1 : 0)
                        - (keys.has('s') || keys.has('arrowdown')   ? 1 : 0);

            const height = camera.positionCartographic.height;
            const maxSpeed = height * SPEED_FACTOR;
            const heading = camera.heading;

            if (right !== 0 || fwd !== 0) {
                // Normaliser diagonal slik at diagonal ikke er raskere enn rett
                const len = Math.sqrt(right * right + fwd * fwd);
                const nr = right / len;
                const nf = fwd / len;

                // Roter input-vektor med kameraets heading
                // Cesium heading: 0 = nord, øker med klokken
                const targetLon =  (nr * Math.cos(heading) + nf * Math.sin(heading)) * maxSpeed;
                const targetLat = (-nr * Math.sin(heading) + nf * Math.cos(heading)) * maxSpeed;

                vel.lon += (targetLon - vel.lon) * ACCELERATION;
                vel.lat += (targetLat - vel.lat) * ACCELERATION;
            } else {
                vel.lon *= FRICTION;
                vel.lat *= FRICTION;
            }

            const moving = Math.abs(vel.lon) > MIN_VELOCITY || Math.abs(vel.lat) > MIN_VELOCITY;

            if (moving) {
                const pos = camera.positionCartographic.clone();
                pos.longitude += vel.lon;
                pos.latitude = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pos.latitude + vel.lat));
                camera.setView({
                    destination: Cartesian3.fromRadians(pos.longitude, pos.latitude, pos.height),
                    orientation: {
                        heading: camera.heading,
                        pitch: camera.pitch,
                        roll: camera.roll,
                    },
                });
                viewer.scene.requestRender();
            } else {
                vel.lon = 0;
                vel.lat = 0;
                loopActiveRef.current = false;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('blur', handleBlur);
        viewer.scene.preRender.addEventListener(handlePreRender);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('blur', handleBlur);
            viewer.scene.preRender.removeEventListener(handlePreRender);
        };
    }, [viewer]);
}
