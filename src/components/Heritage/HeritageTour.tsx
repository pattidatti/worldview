import { useEffect, useRef, useState } from 'react';
import {
    BoundingSphere,
    Cartesian3,
    Cesium3DTileset,
    HeadingPitchRange,
    Math as CesiumMath,
} from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useCinematic } from '@/context/CinematicContext';
import { HERITAGE_SITES, findMonument } from '@/data/heritageSites';
import type { HeritageTourStop } from '@/types/heritage';

interface HeritageTourProps {
    onDone: () => void;
}

const TRANSITION_S = 3.0;
const TILE_WAIT_PER_STOP_MS = 2500;
const PRELOAD_TIMEOUT_MS = 12_000;

function collectVisibleTilesets(scene: { primitives: { length: number; get: (i: number) => unknown } }): Cesium3DTileset[] {
    const out: Cesium3DTileset[] = [];
    for (let i = 0; i < scene.primitives.length; i++) {
        const p = scene.primitives.get(i);
        if (p instanceof Cesium3DTileset && p.show) out.push(p);
    }
    return out;
}

function waitForTilesetsOrTimeout(tilesets: Cesium3DTileset[], timeoutMs: number, abortRef: { aborted: boolean }): Promise<void> {
    if (tilesets.length === 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
        const start = performance.now();
        const tick = () => {
            if (abortRef.aborted) return resolve();
            const elapsed = performance.now() - start;
            const allLoaded = tilesets.every((ts) => ts.tilesLoaded);
            // Krev minst én frame for å la tilesLoaded oppdateres til false ved
            // ny view, ellers vil vi falle gjennom umiddelbart første gang.
            if (elapsed > 50 && (allLoaded || elapsed > timeoutMs)) return resolve();
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
}

/**
 * Cinematic kamera-tour gjennom et verdens-arv-site sine stopp.
 * Bruker camera.flyToBoundingSphere med HeadingPitchRange-offset for rene vinkler.
 *
 * Preload-fase: snapper kameraet usynlig gjennom alle stopp før tour'en starter
 * for å varme opp 3D-tile-cachen. Eliminerer streaming-stutter under flythrough.
 */
export function HeritageTour({ onDone }: HeritageTourProps) {
    const viewer = useViewer();
    const { setCinematicActive } = useCinematic();
    const site = HERITAGE_SITES[0];
    const stops = site.tour.stops;
    const [phase, setPhase] = useState<'preloading' | 'playing'>('preloading');
    const [preloadProgress, setPreloadProgress] = useState(0);
    const [stopIndex, setStopIndex] = useState(0);
    const [captionVisible, setCaptionVisible] = useState(false);
    const timerRef = useRef<number | null>(null);

    // Aktivér cinematic-modus globalt — pauser DR-loops, polling og preRender-arbeid
    // i alle lag som respekterer flagget. Resumerer automatisk ved unmount.
    useEffect(() => {
        setCinematicActive(true);
        return () => setCinematicActive(false);
    }, [setCinematicActive]);

    // Preload-fase: snapp kameraet til hvert stopp og vent på at 3D-tiles laster.
    // Hele fasen er skjult bak en full-screen overlay, så snap-flikkering er usynlig.
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const abortRef = { aborted: false };

        const controller = viewer.scene.screenSpaceCameraController;
        const wasEnabled = controller.enableInputs;
        controller.enableInputs = false;

        const original = {
            position: viewer.camera.position.clone(),
            heading: viewer.camera.heading,
            pitch: viewer.camera.pitch,
            roll: viewer.camera.roll,
        };

        async function preload() {
            const scene = viewer!.scene;
            const tilesets = collectVisibleTilesets(scene);
            const overallStart = performance.now();

            for (let i = 0; i < stops.length; i++) {
                if (abortRef.aborted) return;
                if (performance.now() - overallStart > PRELOAD_TIMEOUT_MS) break;

                const stop = stops[i];
                const lookup = findMonument(stop.monumentId);
                if (!lookup) continue;
                const { monument } = lookup;

                const target = Cartesian3.fromDegrees(
                    monument.center.lon,
                    monument.center.lat,
                    monument.groundElevationM + monument.heightM / 2,
                );
                const sphere = new BoundingSphere(target, monument.baseSizeM);
                viewer!.camera.viewBoundingSphere(
                    sphere,
                    new HeadingPitchRange(
                        CesiumMath.toRadians(stop.headingDeg),
                        CesiumMath.toRadians(stop.pitchDeg),
                        stop.cameraRangeM,
                    ),
                );
                scene.requestRender();

                await waitForTilesetsOrTimeout(tilesets, TILE_WAIT_PER_STOP_MS, abortRef);
                if (abortRef.aborted) return;
                setPreloadProgress((i + 1) / stops.length);
            }

            if (abortRef.aborted) return;

            // Snapp tilbake til opprinnelig posisjon — flyToBoundingSphere i playing-
            // fasen tar over umiddelbart, så bruker ser ikke "tilbake til start".
            viewer!.camera.setView({
                destination: original.position,
                orientation: { heading: original.heading, pitch: original.pitch, roll: original.roll },
            });
            scene.requestRender();
            // La én frame settle så Cesium ikke fortsatt har gamle tile-requests i flight
            await new Promise<void>((r) => requestAnimationFrame(() => r()));
            if (abortRef.aborted) return;
            setPhase('playing');
        }

        preload();

        return () => {
            abortRef.aborted = true;
            if (!viewer.isDestroyed()) {
                controller.enableInputs = wasEnabled;
            }
        };
    }, [viewer, stops]);

    // Bytt stopp: fly kameraet, vis caption, planlegg neste stopp.
    // Kjører bare i playing-fasen. Input-disable håndteres av preload-effekten
    // og holdes av gjennom hele tour'en.
    useEffect(() => {
        if (phase !== 'playing') return;
        if (!viewer || viewer.isDestroyed()) return;
        const stop: HeritageTourStop = stops[stopIndex];
        const lookup = findMonument(stop.monumentId);
        if (!lookup) {
            onDone();
            return;
        }
        const { monument } = lookup;

        // Skjul caption mens kameraet flyr, vis når det stopper
        setCaptionVisible(false);

        const target = Cartesian3.fromDegrees(
            monument.center.lon,
            monument.center.lat,
            monument.groundElevationM + monument.heightM / 2
        );
        const sphere = new BoundingSphere(target, monument.baseSizeM);

        viewer.camera.flyToBoundingSphere(sphere, {
            offset: new HeadingPitchRange(
                CesiumMath.toRadians(stop.headingDeg),
                CesiumMath.toRadians(stop.pitchDeg),
                stop.cameraRangeM
            ),
            duration: TRANSITION_S,
            complete: () => {
                setCaptionVisible(true);
                timerRef.current = window.setTimeout(() => {
                    if (stopIndex < stops.length - 1) {
                        setStopIndex(stopIndex + 1);
                    } else {
                        onDone();
                    }
                }, stop.durationMs);
            },
        });

        return () => {
            if (timerRef.current !== null) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [phase, stopIndex, viewer, stops, onDone]);

    // Escape eller Skip-knapp avbryter
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onDone();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onDone]);

    const stop = stops[stopIndex];

    return (
        <>
            {/* Preload-overlay — skjuler kamera-snap under tile-warmup */}
            {phase === 'preloading' && (
                <div
                    className="fixed inset-0 z-40 flex items-center justify-center"
                    style={{ backgroundColor: 'rgba(8,8,12,0.92)' }}
                >
                    <div className="flex flex-col items-center gap-4 max-w-md px-8 text-center">
                        <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-amber-300">
                            ✦ {site.tour.title}
                        </span>
                        <p className="text-sm text-white/80 font-sans">
                            Forbereder verdens-arven…
                        </p>
                        <div className="w-64 h-[3px] rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,215,0,0.15)' }}>
                            <div
                                className="h-full transition-[width] duration-300 ease-out"
                                style={{
                                    width: `${Math.round(preloadProgress * 100)}%`,
                                    backgroundColor: 'rgb(255,215,0)',
                                    boxShadow: '0 0 12px rgba(255,215,0,0.6)',
                                }}
                            />
                        </div>
                        <button
                            onClick={onDone}
                            className="mt-2 text-[10px] font-mono uppercase tracking-wider text-white/60 hover:text-white transition-colors cursor-pointer"
                        >
                            Avbryt (Esc)
                        </button>
                    </div>
                </div>
            )}

            {/* Topp-banner med tour-tittel og fremdrift */}
            {phase === 'playing' && (
                <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 animate-fade-in-up">
                    <div
                        className="px-5 py-2 rounded-full backdrop-blur-xl border flex items-center gap-3"
                        style={{
                            backgroundColor: 'rgba(0,0,0,0.55)',
                            borderColor: 'rgba(255,215,0,0.4)',
                            boxShadow: '0 0 20px 2px rgba(255,215,0,0.2)',
                        }}
                    >
                        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-amber-300">
                            ✦ {site.tour.title}
                        </span>
                        <span className="text-[10px] font-mono text-white/60">
                            {stopIndex + 1} / {stops.length}
                        </span>
                        <button
                            onClick={onDone}
                            className="text-[10px] font-mono uppercase tracking-wider text-white/70 hover:text-white transition-colors cursor-pointer"
                        >
                            Hopp over (Esc)
                        </button>
                    </div>
                </div>
            )}

            {/* Tekst-boble nede */}
            {phase === 'playing' && captionVisible && (
                <div
                    key={stopIndex}
                    className="absolute bottom-32 left-1/2 -translate-x-1/2 z-30 max-w-xl px-6 animate-fade-in-up"
                >
                    <div
                        className="px-6 py-4 rounded-2xl backdrop-blur-xl border text-center"
                        style={{
                            backgroundColor: 'rgba(0,0,0,0.65)',
                            borderColor: 'rgba(255,215,0,0.35)',
                            boxShadow: '0 0 32px 4px rgba(255,215,0,0.18)',
                        }}
                    >
                        <p className="text-base text-white font-sans leading-relaxed">
                            {stop.caption}
                        </p>
                    </div>
                </div>
            )}
        </>
    );
}
