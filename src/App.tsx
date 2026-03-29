import { useState, useCallback } from 'react';
import { GlobeViewer } from './components/Globe/GlobeViewer';
import { LayerProvider } from './context/LayerContext';
import { PopupRegistryProvider } from './context/PopupRegistry';
import { TopBar } from './components/UI/TopBar';
import { LayerPanel } from './components/UI/LayerPanel';
import { InfoPopup } from './components/UI/InfoPopup';
import { SatelliteLayer } from './components/Layers/SatelliteLayer/SatelliteLayer';
import { FlightLayer } from './components/Layers/FlightLayer/FlightLayer';
import { ShipLayer } from './components/Layers/ShipLayer/ShipLayer';
import { WeatherLayer } from './components/Layers/WeatherLayer/WeatherLayer';
import { WebcamLayer } from './components/Layers/WebcamLayer/WebcamLayer';
import { TrafficLayer } from './components/Layers/TrafficLayer/TrafficLayer';
import { type PopupContent } from './types/popup';

export default function App() {
    const [popup, setPopup] = useState<PopupContent | null>(null);
    const onSelect = useCallback((p: PopupContent | null) => setPopup(p), []);

    return (
        <LayerProvider>
            <PopupRegistryProvider>
                <div className="h-full w-full relative">
                    <GlobeViewer onSelect={onSelect}>
                        <SatelliteLayer />
                        <FlightLayer />
                        <ShipLayer />
                        <WeatherLayer />
                        <WebcamLayer />
                        <TrafficLayer />
                        <TopBar />
                        <LayerPanel />
                        {popup && <InfoPopup content={popup} onClose={() => setPopup(null)} />}
                    </GlobeViewer>
                </div>
            </PopupRegistryProvider>
        </LayerProvider>
    );
}
