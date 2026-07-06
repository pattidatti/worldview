// ShipLayer v2 — tynn React-shim over dataplan (ShipChannel/AIS) + renderplan
// (ShipRenderer, LOD). React gjør kun chrome: synlighet, status, popup/tooltip/
// GEOINT, gate-crossings, mørkt-skip-feed, replay-bytte og cinematic-pause.
// Se docs/SHIP-PARITY.md.

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
import { useDarkShips, shipToDarkRecord } from '@/context/DarkShipsContext';
import { viewportService } from '@/core/ViewportService';
import { lodGovernor } from '@/core/LODGovernor';
import { ShipChannel } from '@/data/channels/shipChannel';
import { ShipRenderer } from '@/render/ShipRenderer';
import { diffItems } from '@/data/DataChannel';
import {
    replayShipToShipEntity,
    SHIP_PICK_PREFIX,
    SHIP_CROSSING_STALENESS_MS,
    type ShipEntity,
} from '@/data/channels/shipProtocol';
import { detectEntityCrossings, type EntityPosition } from '@/utils/crossingDetector';
import { getShipTypeName, getFlagState } from '@/utils/ship-utils';
import { writeCrossings } from '@/services/crossingSync';
import type { EntityDelta } from '@/core/EntityStore';
import { buildShipPopup, buildShipTooltip } from './shipPopup';

const API_KEY = import.meta.env.VITE_AISSTREAM_API_KEY || '';

export function ShipLayerV2() {
    const viewer = useViewer();
    const visible = useLayerVisibility('ships');
    const { cinematicActive } = useCinematic();
    const { mode, modeEpoch } = useTimelineMode();
    const cursor = useReplayCursor(mode);
    const isReplay = mode === 'replay';
    const replayResult = useReplayEntities('ship', cursor);
    const { setLayerLoading, setLayerCount, setLayerError, setLayerLastUpdated } = useLayerActions();
    const { registerById, unregisterById } = usePopupRegistry();
    const { registerById: tooltipRegisterById, unregisterById: tooltipUnregisterById } = useTooltipRegistry();
    const { register: geointRegister, unregister: geointUnregister } = useGeointRegistry();
    const { gates } = useGates();
    const { append: appendTimelineEvents } = useTimelineEventActions();
    const { setDarkShips } = useDarkShips();

    const channelRef = useRef<ShipChannel | null>(null);
    const rendererRef = useRef<ShipRenderer | null>(null);
    const visibleRef = useRef(visible);
    visibleRef.current = visible;
    const gatesRef = useRef(gates);
    gatesRef.current = gates;
    const appendEventsRef = useRef(appendTimelineEvents);
    appendEventsRef.current = appendTimelineEvents;
    const setDarkShipsRef = useRef(setDarkShips);
    setDarkShipsRef.current = setDarkShips;
    const lastEntityStateRef = useRef<Map<string, EntityPosition>>(new Map());
    const lastCursorRef = useRef(cursor);
    const lastModeEpochRef = useRef(modeEpoch);

    if (!channelRef.current) {
        channelRef.current = new ShipChannel({ apiKey: API_KEY });
        rendererRef.current = new ShipRenderer(channelRef.current.store, () => channelRef.current!.getGhosts());
    }
    const channel = channelRef.current;
    const renderer = rendererRef.current!;

    // Status → layerStore
    useEffect(() => {
        return channel.onStatus((status) => {
            setLayerLoading('ships', status.loading);
            setLayerCount('ships', status.count);
            setLayerError('ships', status.error);
            if (status.lastUpdated !== null) setLayerLastUpdated('ships', status.lastUpdated);
        });
    }, [channel, setLayerLoading, setLayerCount, setLayerError, setLayerLastUpdated]);

    // Gate-crossings + mørkt-skip-feed over store-deltaer (batch-kadens)
    useEffect(() => {
        const store = channel.store;
        return store.subscribe((delta: EntityDelta<ShipEntity>) => {
            const state = lastEntityStateRef.current;
            for (const id of delta.removes) state.delete(id);
            const usableGates = gatesRef.current;
            const nowMs = Date.now();
            const events = [];
            for (const ship of delta.upserts) {
                const curr: EntityPosition = { pos: { lat: ship.lat, lon: ship.lon }, ts: nowMs };
                const prev = state.get(ship.id);
                if (prev && usableGates.length > 0) {
                    events.push(...detectEntityCrossings(
                        ship.id, 'ship', prev, curr, usableGates,
                        { maxStalenessMs: SHIP_CROSSING_STALENESS_MS },
                    ));
                }
                state.set(ship.id, curr);
            }
            if (events.length > 0) {
                appendEventsRef.current(events);
                void writeCrossings(events);
            }

            // Mørke skip (fortsatt i AIS) + ghosts (forlot AIS) → DarkShipsPanel
            if (!visibleRef.current) return;
            const darkRecords = [];
            for (const ship of store.getAll().values()) {
                if (ship.dark) darkRecords.push(shipToDarkRecord(ship, false, getFlagState(ship.mmsi)));
            }
            for (const [, ghost] of channel.getGhosts()) {
                darkRecords.push(shipToDarkRecord(ghost.ship, true, getFlagState(ghost.ship.mmsi)));
            }
            setDarkShipsRef.current(darkRecords);
        });
    }, [channel]);

    // Synlighet → renderer attach/detach + kanal + viewport/LOD (live).
    useEffect(() => {
        if (!viewer || viewer.isDestroyed() || !visible) return;
        renderer.attach(viewer);
        renderer.setLOD(lodGovernor.getTier());
        const unsubLod = lodGovernor.subscribe((tier) => renderer.setLOD(tier));
        let unsubViewport: (() => void) | null = null;
        if (!isReplay && API_KEY) {
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
            setLayerCount('ships', 0);
            setDarkShipsRef.current([]);
        };
    }, [viewer, visible, isReplay, channel, renderer, setLayerCount]);

    // Mode-switch / stor cursor-jump: tøm store + crossing-state
    useEffect(() => {
        const jumpLarge = Math.abs(cursor - lastCursorRef.current) > CURSOR_JUMP_THRESHOLD_MS;
        const epochChanged = modeEpoch !== lastModeEpochRef.current;
        lastCursorRef.current = cursor;
        lastModeEpochRef.current = modeEpoch;
        if (!jumpLarge && !epochChanged) return;
        channel.store.clear();
        lastEntityStateRef.current.clear();
    }, [modeEpoch, cursor, channel]);

    // Replay-drevet store (kanalen er stoppet i replay)
    useEffect(() => {
        if (!isReplay || !visible) return;
        const store = channel.store;
        const entities = replayResult.entities.map((s) => replayShipToShipEntity(s, cursor));
        store.applyDelta(diffItems(store, entities));
        setLayerCount('ships', store.size);
        setLayerLastUpdated('ships', cursor);
    }, [isReplay, visible, replayResult.entities, cursor, channel, setLayerCount, setLayerLastUpdated]);

    // Cinematic (ships holder strømmen — no-op på kanalen, men følg kontrakten)
    useEffect(() => {
        channel.setPaused(cinematicActive);
    }, [channel, cinematicActive]);

    // Popup + tooltip via id-oppslag
    useEffect(() => {
        const store = channel.store;
        registerById(SHIP_PICK_PREFIX, (pickedId) => {
            if (!visibleRef.current) return null;
            const ship = store.get(pickedId.slice(SHIP_PICK_PREFIX.length));
            return ship ? buildShipPopup(ship) : null;
        });
        tooltipRegisterById(SHIP_PICK_PREFIX, (pickedId) => {
            if (!visibleRef.current) return null;
            const ship = store.get(pickedId.slice(SHIP_PICK_PREFIX.length));
            return ship ? buildShipTooltip(ship) : null;
        });
        return () => {
            unregisterById(SHIP_PICK_PREFIX);
            tooltipUnregisterById(SHIP_PICK_PREFIX);
        };
    }, [channel, registerById, unregisterById, tooltipRegisterById, tooltipUnregisterById]);

    // GEOINT-provider
    useEffect(() => {
        const store = channel.store;
        geointRegister('ships', () => {
            if (!visibleRef.current || store.size === 0) return null;
            const items = [...store.getAll().values()].slice(0, 10).map((s) =>
                `${s.name || `MMSI ${s.mmsi}`} ${getShipTypeName(s.shipType)} ${s.speed.toFixed(1)}kn${s.destination ? ` → ${s.destination}` : ''}`);
            return { layerId: 'ships', label: 'Skipstrafikk', count: store.size, items };
        });
        return () => geointUnregister('ships');
    }, [channel, geointRegister, geointUnregister]);

    if (!API_KEY) return null;
    return null;
}
