// FlightLayer v2 — tynn React-shim over dataplan + renderplan
// (jf. docs/ARCHITECTURE-VISION.md): FlightChannel eier poll/DR-syklusen
// (i channel-workeren), FlightRenderer eier BillboardCollection.
// React her gjør KUN chrome-kobling: synlighet, status til layerStore,
// popup-/tooltip-/geoint-registrering og cinematic/replay-pause.

import { useEffect, useRef } from 'react';
import { useViewer } from '@/context/ViewerContext';
import { useCinematic } from '@/context/CinematicContext';
import { useLayerActions, useLayerVisibility } from '@/store/layerStore';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useTooltipRegistry } from '@/context/TooltipRegistry';
import { useGeointRegistry } from '@/context/GeointContext';
import { useTimelineMode } from '@/context/TimelineModeContext';
import { viewportService } from '@/core/ViewportService';
import { lodGovernor } from '@/core/LODGovernor';
import { FlightChannel } from '@/data/channels/flightChannel';
import { FlightRenderer } from '@/render/FlightRenderer';
import { buildFlightPopup, buildFlightTooltip } from './flightPopup';

const PICK_PREFIX = 'flights:';

export function FlightLayerV2() {
    const viewer = useViewer();
    const visible = useLayerVisibility('flights');
    const { cinematicActive } = useCinematic();
    const { mode } = useTimelineMode();
    const isReplay = mode === 'replay';
    const { setLayerLoading, setLayerCount, setLayerError, setLayerLastUpdated } = useLayerActions();
    const { registerById, unregisterById } = usePopupRegistry();
    const { registerById: tooltipRegisterById, unregisterById: tooltipUnregisterById } = useTooltipRegistry();
    const { register: geointRegister, unregister: geointUnregister } = useGeointRegistry();

    const channelRef = useRef<FlightChannel | null>(null);
    const rendererRef = useRef<FlightRenderer | null>(null);
    const visibleRef = useRef(visible);
    visibleRef.current = visible;

    if (!channelRef.current) {
        channelRef.current = new FlightChannel();
        rendererRef.current = new FlightRenderer(channelRef.current.store);
    }
    const channel = channelRef.current;
    const renderer = rendererRef.current!;

    // Status → layerStore (samme kontrakt som alle lag)
    useEffect(() => {
        return channel.onStatus((status) => {
            setLayerLoading('flights', status.loading);
            setLayerCount('flights', status.count);
            setLayerError('flights', status.error);
            if (status.lastUpdated !== null) setLayerLastUpdated('flights', status.lastUpdated);
        });
    }, [channel, setLayerLoading, setLayerCount, setLayerError, setLayerLastUpdated]);

    // Synlighet → kanal-livssyklus + renderer attach/detach + viewport-abonnement
    useEffect(() => {
        if (!viewer || viewer.isDestroyed() || !visible) return;
        renderer.attach(viewer.scene);
        const current = viewportService.getCurrent();
        if (current) channel.setViewport(current);
        channel.start();
        const unsubViewport = viewportService.subscribe((vp) => channel.setViewport(vp));
        const unsubLod = lodGovernor.subscribe((tier) => renderer.setLOD(tier));
        renderer.setLOD(lodGovernor.getTier());
        return () => {
            unsubViewport();
            unsubLod();
            channel.stop();
            renderer.detach();
            setLayerCount('flights', 0);
        };
    }, [viewer, visible, channel, renderer, setLayerCount]);

    // Cinematic-tur og replay-modus pauser polling + DR (fase B6 kobler replay-data)
    useEffect(() => {
        channel.setPaused(cinematicActive || isReplay);
    }, [channel, cinematicActive, isReplay]);

    // Popup + tooltip via id-oppslag i EntityStore (PopupRegistry-kontrakten
    // fra visjonsdokumentet: builder får id, ikke Entity)
    useEffect(() => {
        const store = channel.store;
        registerById(PICK_PREFIX, (pickedId) => {
            if (!visibleRef.current) return null;
            const flight = store.get(pickedId.slice(PICK_PREFIX.length));
            return flight ? buildFlightPopup(flight) : null;
        });
        tooltipRegisterById(PICK_PREFIX, (pickedId) => {
            if (!visibleRef.current) return null;
            const flight = store.get(pickedId.slice(PICK_PREFIX.length));
            return flight ? buildFlightTooltip(flight) : null;
        });
        return () => {
            unregisterById(PICK_PREFIX);
            tooltipUnregisterById(PICK_PREFIX);
        };
    }, [channel, registerById, unregisterById, tooltipRegisterById, tooltipUnregisterById]);

    // GEOINT-provider (samme innhold som legacy-laget)
    useEffect(() => {
        const store = channel.store;
        geointRegister('flights', () => {
            if (!visibleRef.current || store.size === 0) return null;
            const flights = [...store.getAll().values()];
            const items = flights.slice(0, 10).map((f) => {
                const altFt = Math.round(f.altitude * 3.28084 / 1000);
                return `${f.callsign || f.icao24}${f.isMilitary ? ' [MILITÆR]' : ''} (${f.originCountry}) hdg ${Math.round(f.heading)}° alt ${altFt}kft`;
            });
            return { layerId: 'flights', label: 'Flytrafikk', count: flights.length, items };
        });
        return () => geointUnregister('flights');
    }, [channel, geointRegister, geointUnregister]);

    return null;
}
