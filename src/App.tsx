import { useState, useCallback, useRef, useMemo } from 'react';
import { GlobeViewer } from './components/Globe/GlobeViewer';
import { LayerProvider, useLayers } from './context/LayerContext';
import { PopupRegistryProvider } from './context/PopupRegistry';
import { TopBar } from './components/UI/TopBar';
import { LayerPanel } from './components/UI/LayerPanel';
import { InfoPopup } from './components/UI/InfoPopup';
import { ToastContainer } from './components/UI/Toast';
import { LayerErrorWatcher } from './components/UI/LayerErrorWatcher';
import { SatelliteLayer } from './components/Layers/SatelliteLayer/SatelliteLayer';
import { FlightLayer } from './components/Layers/FlightLayer/FlightLayer';
import { ShipLayer } from './components/Layers/ShipLayer/ShipLayer';
import { WeatherLayer } from './components/Layers/WeatherLayer/WeatherLayer';
import { WebcamLayer } from './components/Layers/WebcamLayer/WebcamLayer';
import { TrafficLayer } from './components/Layers/TrafficLayer/TrafficLayer';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { LAYER_DEFAULTS } from './types/layers';
import { type PopupContent } from './types/popup';
import { type SearchBarHandle } from './components/UI/SearchBar';

const LAYER_IDS = LAYER_DEFAULTS.map((l) => l.id);

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
                <TopBar searchRef={searchRef} />
                <LayerPanel />
                <LayerErrorWatcher />
                {popup && <InfoPopup content={popup} onClose={closePopup} />}
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
        <LayerProvider>
            <PopupRegistryProvider>
                <AppContent
                    popup={popup}
                    setPopup={setPopup}
                    onSelect={onSelect}
                    searchRef={searchRef}
                />
            </PopupRegistryProvider>
        </LayerProvider>
    );
}
