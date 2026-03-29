import { useState, useCallback } from 'react';
import { GlobeViewer } from './components/Globe/GlobeViewer';
import { LayerProvider } from './context/LayerContext';
import { LayerPanel } from './components/UI/LayerPanel';
import { InfoPopup } from './components/UI/InfoPopup';
import { SatelliteLayer } from './components/Layers/SatelliteLayer/SatelliteLayer';
import { type PopupContent } from './types/popup';

export default function App() {
    const [popup, setPopup] = useState<PopupContent | null>(null);
    const onSelect = useCallback((p: PopupContent | null) => setPopup(p), []);

    return (
        <LayerProvider>
            <div className="h-full w-full relative">
                <GlobeViewer>
                    <SatelliteLayer onSelect={onSelect} />
                </GlobeViewer>
                <LayerPanel />
                {popup && <InfoPopup content={popup} onClose={() => setPopup(null)} />}
            </div>
        </LayerProvider>
    );
}
