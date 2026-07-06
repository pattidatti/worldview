// FlightLayer v2 — tynn React-shim over dataplan + renderplan
// (jf. docs/ARCHITECTURE-VISION.md): FlightChannel eier poll/DR-syklusen
// (i channel-workeren), FlightRenderer eier BillboardCollection.
// React her gjør KUN chrome-kobling: synlighet, status til layerStore,
// popup-/tooltip-/geoint-registrering, gate-crossings, replay-bytte og
// cinematic-pause.

import { useEffect, useRef } from 'react';
import { useViewer } from '@/context/ViewerContext';
import { useCinematic } from '@/context/CinematicContext';
import { useLayerActions, useLayerVisibility } from '@/store/layerStore';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useTooltipRegistry } from '@/context/TooltipRegistry';
import { useGeointRegistry } from '@/context/GeointContext';
import { useGates } from '@/context/GateContext';
import { useTimelineEventActions } from '@/context/TimelineEventContext';
import { useTimelineMode, useReplayCursor, CURSOR_JUMP_THRESHOLD_MS } from '@/context/TimelineModeContext';
import { useReplayEntities } from '@/hooks/useReplayEntities';
import { viewportService } from '@/core/ViewportService';
import { lodGovernor } from '@/core/LODGovernor';
import { FlightChannel } from '@/data/channels/flightChannel';
import { diffItems } from '@/data/DataChannel';
import { replayFlightToFlightEntity, type FlightEntity } from '@/data/channels/flightProtocol';
import { FlightRenderer } from '@/render/FlightRenderer';
import { detectEntityCrossings, type EntityPosition } from '@/utils/crossingDetector';
import { FLIGHT_POLL_MS } from '@/utils/flightKinematics';
import { isFlightsMockEnabled } from '@/utils/featureFlags';
import { writeCrossings } from '@/services/crossingSync';
import type { EntityDelta } from '@/core/EntityStore';
import { buildFlightPopup, buildFlightTooltip } from './flightPopup';

const PICK_PREFIX = 'flights:';
/** Stale-vern som legacy: ignorer crossings når dt > 2 × poll-kadens. */
const CROSSING_MAX_STALENESS_MS = 2 * FLIGHT_POLL_MS;

export function FlightLayerV2() {
    const viewer = useViewer();
    const visible = useLayerVisibility('flights');
    const { cinematicActive } = useCinematic();
    const { mode, modeEpoch } = useTimelineMode();
    const cursor = useReplayCursor(mode);
    const isReplay = mode === 'replay';
    const replayResult = useReplayEntities('flight', cursor);
    const { setLayerLoading, setLayerCount, setLayerError, setLayerLastUpdated } = useLayerActions();
    const { registerById, unregisterById } = usePopupRegistry();
    const { registerById: tooltipRegisterById, unregisterById: tooltipUnregisterById } = useTooltipRegistry();
    const { register: geointRegister, unregister: geointUnregister } = useGeointRegistry();
    const { gates } = useGates();
    const { append: appendTimelineEvents } = useTimelineEventActions();

    const channelRef = useRef<FlightChannel | null>(null);
    const rendererRef = useRef<FlightRenderer | null>(null);
    const visibleRef = useRef(visible);
    visibleRef.current = visible;
    const gatesRef = useRef(gates);
    gatesRef.current = gates;
    const appendEventsRef = useRef(appendTimelineEvents);
    appendEventsRef.current = appendTimelineEvents;
    const lastEntityStateRef = useRef<Map<string, EntityPosition>>(new Map());
    const lastCursorRef = useRef(cursor);
    const lastModeEpochRef = useRef(modeEpoch);

    if (!channelRef.current) {
        channelRef.current = new FlightChannel({ mock: isFlightsMockEnabled() });
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

    // Gate-crossing-deteksjon over storens deltaer (poll-kadens, som legacy).
    // Uendrede fly gir ingen upsert — og kan heller ikke ha krysset noe.
    useEffect(() => {
        const store = channel.store;
        return store.subscribe((delta: EntityDelta<FlightEntity>) => {
            const state = lastEntityStateRef.current;
            for (const id of delta.removes) state.delete(id);

            const usableGates = gatesRef.current;
            const nowMs = Date.now();
            const events = [];
            for (const flight of delta.upserts) {
                // Parkerte/taxiende fly skjules i rendereren (parity med legacy) —
                // hopp også over dem her så de ikke genererer spuriøse crossings.
                if (flight.onGround) {
                    state.delete(flight.id);
                    continue;
                }
                const curr: EntityPosition = { pos: { lat: flight.lat, lon: flight.lon }, ts: nowMs };
                const prev = state.get(flight.id);
                if (prev && usableGates.length > 0) {
                    events.push(...detectEntityCrossings(
                        flight.id, 'flight', prev, curr, usableGates,
                        { maxStalenessMs: CROSSING_MAX_STALENESS_MS },
                    ));
                }
                state.set(flight.id, curr);
            }
            if (events.length > 0) {
                appendEventsRef.current(events);
                void writeCrossings(events);
            }
        });
    }, [channel]);

    // Synlighet → renderer attach/detach + kanal-livssyklus + viewport/LOD.
    // I replay-modus stoppes kanalen; storen drives fra replay-effekten under.
    useEffect(() => {
        if (!viewer || viewer.isDestroyed() || !visible) return;
        renderer.attach(viewer.scene);
        renderer.setLOD(lodGovernor.getTier());
        const unsubLod = lodGovernor.subscribe((tier) => renderer.setLOD(tier));

        let unsubViewport: (() => void) | null = null;
        if (!isReplay) {
            const current = viewportService.getCurrent();
            if (current) channel.setViewport(current);
            channel.start();
            unsubViewport = viewportService.subscribe((vp) => channel.setViewport(vp));
        }
        return () => {
            unsubLod();
            unsubViewport?.();
            channel.stop();
            renderer.detach();
            setLayerCount('flights', 0);
        };
    }, [viewer, visible, isReplay, channel, renderer, setLayerCount]);

    // Mode-switch og cursor-jump > 15 min: tøm store + crossing-state slik at
    // live- og replay-avledede posisjoner aldri blandes.
    useEffect(() => {
        const jumpLarge = Math.abs(cursor - lastCursorRef.current) > CURSOR_JUMP_THRESHOLD_MS;
        const epochChanged = modeEpoch !== lastModeEpochRef.current;
        lastCursorRef.current = cursor;
        lastModeEpochRef.current = modeEpoch;
        if (!jumpLarge && !epochChanged) return;
        channel.store.clear();
        lastEntityStateRef.current.clear();
    }, [modeEpoch, cursor, channel]);

    // Replay-drevet store: samme renderer, annen datakilde — kanalen er stoppet.
    useEffect(() => {
        if (!isReplay || !visible) return;
        const store = channel.store;
        const entities = replayResult.entities.map(replayFlightToFlightEntity);
        store.applyDelta(diffItems(store, entities));
        setLayerCount('flights', store.size);
        setLayerLastUpdated('flights', cursor);
    }, [isReplay, visible, replayResult.entities, cursor, channel, setLayerCount, setLayerLastUpdated]);

    // Cinematic-tur pauser polling + DR
    useEffect(() => {
        channel.setPaused(cinematicActive);
    }, [channel, cinematicActive]);

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
