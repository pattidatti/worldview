import { useState, useCallback, useRef, useMemo } from 'react';
import { GlobeViewer } from './components/Globe/GlobeViewer';
import { LayerProvider, useLayers } from './context/LayerContext';
import { PopupRegistryProvider } from './context/PopupRegistry';
import { TooltipRegistryProvider, useTooltipRegistry } from './context/TooltipRegistry';
import { TopBar } from './components/UI/TopBar';
import { LayerPanel } from './components/UI/LayerPanel';
import { InfoPopup } from './components/UI/InfoPopup';
import { EntityTooltip } from './components/UI/EntityTooltip';
import { ToastContainer } from './components/UI/Toast';
import { LayerErrorWatcher } from './components/UI/LayerErrorWatcher';
import { SatelliteLayer } from './components/Layers/SatelliteLayer/SatelliteLayer';
import { FlightLayer } from './components/Layers/FlightLayer/FlightLayer';
import { ShipLayer } from './components/Layers/ShipLayer/ShipLayer';
import { WeatherLayer } from './components/Layers/WeatherLayer/WeatherLayer';
import { WebcamLayer } from './components/Layers/WebcamLayer/WebcamLayer';
import { TrafficLayer } from './components/Layers/TrafficLayer/TrafficLayer';
import { TrafficFlowLayer } from './components/Layers/TrafficFlowLayer/TrafficFlowLayer';
import { InfrastructureLayer } from './components/Layers/InfrastructureLayer/InfrastructureLayer';
import { PowerLayer } from './components/Layers/PowerLayer/PowerLayer';
import { WindLayer } from './components/Layers/WindLayer/WindLayer';
import { HarborLayer } from './components/Layers/HarborLayer/HarborLayer';
import { LighthouseLayer } from './components/Layers/LighthouseLayer/LighthouseLayer';
import { TelecomLayer } from './components/Layers/TelecomLayer/TelecomLayer';
import { MineLayer } from './components/Layers/MineLayer/MineLayer';
import { BuildingsLayer } from './components/Layers/BuildingsLayer/BuildingsLayer';
import { SubmarineCableLayer } from './components/Layers/SubmarineCableLayer/SubmarineCableLayer';
import { EarthquakeLayer } from './components/Layers/EarthquakeLayer/EarthquakeLayer';
import { DisasterLayer } from './components/Layers/DisasterLayer/DisasterLayer';
import { AsteroidLayer } from './components/Layers/AsteroidLayer/AsteroidLayer';
import { NewsLayer } from './components/Layers/NewsLayer/NewsLayer';
import { ConflictLayer } from './components/Layers/ConflictLayer/ConflictLayer';
import { WeatherRadarLayer } from './components/Layers/WeatherRadarLayer/WeatherRadarLayer';
import { SigmetLayer } from './components/Layers/SigmetLayer/SigmetLayer';
import { PlaceLabels } from './components/Globe/PlaceLabels';
import { ImageryProvider } from './context/ImageryContext';
import { ImageryPicker } from './components/UI/ImageryPicker';
import { ShaderOverlayProvider } from './context/ShaderOverlayContext';
import { ShaderOverlayPicker } from './components/UI/ShaderOverlayPicker';
import { HudOverlay } from './components/UI/HudOverlay';
import { PortholeOverlay } from './components/UI/PortholeOverlay';
import { CameraHud } from './components/UI/CameraHud';
import { StatusTicker } from './components/UI/StatusTicker';
import { EventLog } from './components/UI/EventLog';
import { TrackingProvider, useTracking } from './context/TrackingContext';
import { OrbitProvider } from './context/OrbitContext';
import { OrbitButton } from './components/UI/OrbitButton';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useHoverTooltip } from './hooks/useHoverTooltip';
import { useViewer } from './context/ViewerContext';
import { LAYER_DEFAULTS } from './types/layers';
import { type PopupContent } from './types/popup';
import { type SearchBarHandle } from './components/UI/SearchBar';

const LAYER_IDS = LAYER_DEFAULTS.map((l) => l.id);

function TooltipHandler() {
    const viewer = useViewer();
    const { resolve } = useTooltipRegistry();
    const hover = useHoverTooltip(viewer, resolve);
    return hover ? <EntityTooltip hover={hover} /> : null;
}

function AppContent({
    popup,
    setPopup,
    onSelect,
    searchRef,
}: {
    popup: PopupContent | null;
    setPopup: (p: PopupContent | null) => void;
    onSelect: (p: PopupContent | null) => void;
    searchRef: React.RefObject<SearchBarHandle | null>;
}) {
    const { toggleLayer } = useLayers();
    const { trackedEntityId, setTrackedEntityId } = useTracking();

    const closePopup = useCallback(() => {
        setPopup(null);
        setTrackedEntityId(null);
    }, [setPopup, setTrackedEntityId]);
    const focusSearch = useCallback(() => searchRef.current?.focus(), [searchRef]);
    const layerIds = useMemo(() => LAYER_IDS, []);

    useKeyboardShortcuts({
        toggleLayer,
        closePopup,
        focusSearch,
        layerIds,
    });

    return (
        <div className="h-full w-full relative">
            <GlobeViewer onSelect={onSelect}>
                <SatelliteLayer />
                <FlightLayer />
                <ShipLayer />
                <WeatherLayer />
                <WebcamLayer />
                <TrafficLayer />
                <TrafficFlowLayer />
                <InfrastructureLayer />
                <PowerLayer />
                <WindLayer />
                <HarborLayer />
                <LighthouseLayer />
                <TelecomLayer />
                <MineLayer />
                <BuildingsLayer />
                <SubmarineCableLayer />
                <EarthquakeLayer />
                <DisasterLayer />
                <AsteroidLayer />
                <NewsLayer />
                <ConflictLayer />
                <WeatherRadarLayer />
                <SigmetLayer />
                <PlaceLabels />
                <TopBar searchRef={searchRef} />
                <LayerPanel />
                <ImageryPicker />
                <ShaderOverlayPicker />
                <PortholeOverlay />
                <HudOverlay />
                <EventLog />
                <CameraHud />
                <OrbitButton />
                <StatusTicker />
                <LayerErrorWatcher />
                {popup && (
                    <InfoPopup
                        content={popup}
                        onClose={closePopup}
                        onFollow={setTrackedEntityId}
                        isFollowing={trackedEntityId !== null && trackedEntityId === popup.followEntityId}
                    />
                )}
                <TooltipHandler />
            </GlobeViewer>
            <ToastContainer />
        </div>
    );
}

export default function App() {
    const [popup, setPopup] = useState<PopupContent | null>(null);
    const onSelect = useCallback((p: PopupContent | null) => setPopup(p), []);
    const searchRef = useRef<SearchBarHandle>(null);

    return (
        <ShaderOverlayProvider>
        <ImageryProvider>
        <LayerProvider>
        <TrackingProvider>
        <OrbitProvider>
            <PopupRegistryProvider>
            <TooltipRegistryProvider>
                <AppContent
                    popup={popup}
                    setPopup={setPopup}
                    onSelect={onSelect}
                    searchRef={searchRef}
                />
            </TooltipRegistryProvider>
            </PopupRegistryProvider>
        </OrbitProvider>
        </TrackingProvider>
        </LayerProvider>
        </ImageryProvider>
        </ShaderOverlayProvider>
    );
}
