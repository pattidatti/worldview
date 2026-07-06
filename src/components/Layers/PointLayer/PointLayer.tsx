// Generisk React-shim for de forente punktlagene (Fase D): ÉN komponent driver
// et vilkårlig punktlag ut fra dens PointLayerConfig. Erstatter ~seks nær
// identiske lag-komponenter. React gjør kun chrome: synlighet, status til
// layerStore, popup/tooltip/GEOINT-registrering og cinematic-pause.
//
// Dataplan (PointChannel) og renderplan (PointRenderer) lever utenfor React;
// denne komponenten kobler dem til Cesium-viewer og UI-registrene.

import { useEffect, useRef } from 'react';
import { useViewer } from '@/context/ViewerContext';
import { useCinematic } from '@/context/CinematicContext';
import { useLayerActions, useLayerVisibility } from '@/store/layerStore';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useTooltipRegistry } from '@/context/TooltipRegistry';
import { useGeointRegistry } from '@/context/GeointContext';
import { viewportService } from '@/core/ViewportService';
import { lodGovernor } from '@/core/LODGovernor';
import { PointChannel } from '@/data/channels/pointChannel';
import { PointRenderer } from '@/render/PointRenderer';
import type { PointLayerConfig } from '@/data/channels/pointProtocol';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function PointLayer({ config }: { config: PointLayerConfig<any> }) {
    const viewer = useViewer();
    const visible = useLayerVisibility(config.layerId);
    const { cinematicActive } = useCinematic();
    const { setLayerLoading, setLayerCount, setLayerError, setLayerLastUpdated } = useLayerActions();
    const { registerById, unregisterById } = usePopupRegistry();
    const { registerById: tooltipRegisterById, unregisterById: tooltipUnregisterById } = useTooltipRegistry();
    const { register: geointRegister, unregister: geointUnregister } = useGeointRegistry();

    const channelRef = useRef<PointChannel<unknown> | null>(null);
    const rendererRef = useRef<PointRenderer<unknown> | null>(null);
    const visibleRef = useRef(visible);
    visibleRef.current = visible;

    if (!channelRef.current) {
        channelRef.current = new PointChannel(config);
        rendererRef.current = new PointRenderer(channelRef.current.store, config, config.mode);
    }
    const channel = channelRef.current;
    const renderer = rendererRef.current!;
    const prefix = `${config.layerId}:`;

    // Status → layerStore (samme kontrakt som alle lag)
    useEffect(() => {
        return channel.onStatus((status) => {
            setLayerLoading(config.layerId, status.loading);
            setLayerCount(config.layerId, status.count);
            setLayerError(config.layerId, status.error);
            if (status.lastUpdated !== null) setLayerLastUpdated(config.layerId, status.lastUpdated);
        });
    }, [channel, config.layerId, setLayerLoading, setLayerCount, setLayerError, setLayerLastUpdated]);

    // Synlighet → renderer attach/detach + kanal-livssyklus + viewport/LOD
    useEffect(() => {
        if (!viewer || viewer.isDestroyed() || !visible) return;
        renderer.attach(viewer.scene);
        renderer.setLOD(lodGovernor.getTier());
        const unsubLod = lodGovernor.subscribe((tier) => renderer.setLOD(tier));
        const current = viewportService.getCurrent();
        if (current) channel.setViewport(current);
        channel.start();
        const unsubViewport = config.viewportAware
            ? viewportService.subscribe((vp) => channel.setViewport(vp))
            : null;
        return () => {
            unsubLod();
            unsubViewport?.();
            channel.stop();
            renderer.detach();
            setLayerCount(config.layerId, 0);
        };
    }, [viewer, visible, channel, renderer, config.layerId, config.viewportAware, setLayerCount]);

    // Cinematic-tur pauser polling
    useEffect(() => {
        channel.setPaused(cinematicActive);
    }, [channel, cinematicActive]);

    // Popup + tooltip via id-oppslag i EntityStore (samme kontrakt som FlightLayerV2)
    useEffect(() => {
        const store = channel.store;
        registerById(prefix, (pickedId) => {
            if (!visibleRef.current) return null;
            const e = store.get(pickedId.slice(prefix.length));
            return e ? config.buildPopup(e.source) : null;
        });
        tooltipRegisterById(prefix, (pickedId) => {
            if (!visibleRef.current) return null;
            const e = store.get(pickedId.slice(prefix.length));
            return e ? config.buildTooltip(e.source) : null;
        });
        return () => {
            unregisterById(prefix);
            tooltipUnregisterById(prefix);
        };
    }, [channel, config, prefix, registerById, unregisterById, tooltipRegisterById, tooltipUnregisterById]);

    // GEOINT-provider (valgfri)
    useEffect(() => {
        if (!config.buildGeoint) return;
        const build = config.buildGeoint;
        const store = channel.store;
        geointRegister(config.layerId, () => {
            if (!visibleRef.current || store.size === 0) return null;
            return build([...store.getAll().values()].map((e) => e.source));
        });
        return () => geointUnregister(config.layerId);
    }, [channel, config, geointRegister, geointUnregister]);

    return null;
}
