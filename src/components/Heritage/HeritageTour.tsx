import { useEffect, useRef, useState } from 'react';
import {
    BoundingSphere,
    Cartesian3,
    HeadingPitchRange,
    Math as CesiumMath,
} from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { HERITAGE_SITES, findMonument } from '@/data/heritageSites';
import type { HeritageTourStop } from '@/types/heritage';

interface HeritageTourProps {
    onDone: () => void;
}

const TRANSITION_S = 3.0;

/**
 * Cinematic kamera-tour gjennom et verdens-arv-site sine stopp.
 * Bruker camera.flyToBoundingSphere med HeadingPitchRange-offset for rene vinkler.
 *
 * MVP bruker første site (Giza). Senere kan vi velge basert på kameraposisjon.
 */
export function HeritageTour({ onDone }: HeritageTourProps) {
    const viewer = useViewer();
    const site = HERITAGE_SITES[0];
    const stops = site.tour.stops;
    const [stopIndex, setStopIndex] = useState(0);
    const [captionVisible, setCaptionVisible] = useState(false);
    const timerRef = useRef<number | null>(null);

    // Bytt stopp: fly kameraet, vis caption, planlegg neste stopp
    useEffect(() => {
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

        // Disable kamera-input under tour
        const controller = viewer.scene.screenSpaceCameraController;
        const wasEnabled = controller.enableInputs;
        controller.enableInputs = false;

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
            controller.enableInputs = wasEnabled;
        };
    }, [stopIndex, viewer, stops, onDone]);

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
            {/* Topp-banner med tour-tittel og fremdrift */}
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

            {/* Tekst-boble nede */}
            {captionVisible && (
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
