// Ytelses-HUD for akseptansemåling (?perfHud): FPS, antall rendrede frames
// (idle-testen: 0 frames på 10 s uten input), og objekt-tellere fra
// entityStores. Ren DOM — ingen React, null kostnad når flagget er av.

import type { Viewer } from 'cesium';
import { entityStores } from '@/core/EntityStore';

const UPDATE_INTERVAL_MS = 500;
const CHANNELS = ['flights', 'ships'] as const;

export function maybeInstallPerfHud(viewer: Viewer): (() => void) | null {
    try {
        if (!new URLSearchParams(window.location.search).has('perfHud')) return null;
    } catch {
        return null;
    }

    const el = document.createElement('div');
    el.style.cssText = [
        'position:fixed', 'top:60px', 'right:12px', 'z-index:9999',
        'background:rgba(0,0,0,0.75)', 'color:#7CFC9A', 'padding:8px 12px',
        'font:11px "JetBrains Mono", monospace', 'border:1px solid #2a4',
        'border-radius:6px', 'pointer-events:none', 'white-space:pre',
    ].join(';');
    document.body.appendChild(el);

    let frames = 0;
    let framesWindow = 0;
    let windowStart = performance.now();
    let fps = 0;
    let idleSince = performance.now();

    const removePostRender = viewer.scene.postRender.addEventListener(() => {
        frames++;
        framesWindow++;
        idleSince = performance.now();
        const now = performance.now();
        if (now - windowStart >= 1000) {
            fps = (framesWindow * 1000) / (now - windowStart);
            framesWindow = 0;
            windowStart = now;
        }
    });

    const timer = setInterval(() => {
        const idleS = (performance.now() - idleSince) / 1000;
        const counts = CHANNELS
            .map((id) => {
                const store = entityStores.get(id);
                return store ? `${id}: ${store.size} (v${store.version})` : null;
            })
            .filter(Boolean)
            .join('\n');
        el.textContent =
            `FPS      ${fps.toFixed(0)}\n` +
            `frames   ${frames}\n` +
            `idle     ${idleS.toFixed(1)}s\n` +
            (counts ? counts : '(ingen kanaler)');
    }, UPDATE_INTERVAL_MS);

    return () => {
        clearInterval(timer);
        removePostRender();
        el.remove();
    };
}
