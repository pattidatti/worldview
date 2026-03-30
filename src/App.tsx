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
import { PlaceLabels } from './components/Globe/PlaceLabels';
import { ImageryProvider } from './context/ImageryContext';
import { ImageryPicker } from './components/UI/ImageryPicker';
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

    const closePopup = useCallback(() => setPopup(null), [setPopup]);
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
                <PlaceLabels />
                <TopBar searchRef={searchRef} />
                <LayerPanel />
                <ImageryPicker />
                <LayerErrorWatcher />
                {popup && <InfoPopup content={popup} onClose={closePopup} />}
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
        <ImageryProvider>
        <LayerProvider>
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
        </LayerProvider>
        </ImageryProvider>
    );
}
