import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { AuthProvider } from './context/AuthContext';
import { HistoryProvider } from './context/HistoryContext';
import { SignInGate } from './components/UI/SignInGate';
import { AnalysisPanelProvider } from './components/UI/AnalysisPanel/AnalysisPanelHost';
import { GateProvider, useGates } from './context/GateContext';
import { TimelineEventProvider } from './context/TimelineEventContext';
import { GateLayer } from './components/Layers/GateLayer/GateLayer';
import { GateNameModal } from './components/UI/GateNameModal';
import { GateDrawHud } from './components/UI/GateDrawHud';
import { GatePanel } from './components/UI/GatePanel';
import { addToast } from './components/UI/Toast';
import type { LatLon } from './types/gate';
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
import { SimulatedTrafficLayer } from './components/Layers/SimulatedTrafficLayer/SimulatedTrafficLayer';
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
import { WeatherRadarControls } from './components/UI/WeatherRadarControls';
import { WeatherRadarProvider } from './context/WeatherRadarContext';
import { SigmetLayer } from './components/Layers/SigmetLayer/SigmetLayer';
import { RoadCameraLayer } from './components/Layers/RoadCameraLayer/RoadCameraLayer';
import { GPSJamLayer } from './components/Layers/GPSJamLayer/GPSJamLayer';
import { ChokepointLayer } from './components/Layers/ChokepointLayer/ChokepointLayer';
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
import { GeointProvider } from './context/GeointContext';
import { MissionControl } from './components/UI/MissionControl';
import { OrbitButton } from './components/UI/OrbitButton';
import { ResetCameraButton } from './components/UI/ResetCameraButton';
import { GeoNavigator } from './components/UI/GeoNavigator';
import { KeyboardHelpModal } from './components/UI/KeyboardHelpModal';
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
    const { isDrawingRef } = useGates();
    const hover = useHoverTooltip(viewer, resolve, isDrawingRef);
    return hover ? <EntityTooltip hover={hover} /> : null;
}

function AppContent({
    popup,
    setPopup,
    onSelect,
    searchRef,
    showHelp,
    setShowHelp,
}: {
    popup: PopupContent | null;
    setPopup: (p: PopupContent | null) => void;
    onSelect: (p: PopupContent | null) => void;
    searchRef: React.RefObject<SearchBarHandle | null>;
    showHelp: boolean;
    setShowHelp: (v: boolean) => void;
}) {
    const { toggleLayer, isVisible } = useLayers();
    const { trackedEntityId, setTrackedEntityId } = useTracking();
    const { addGate, startDrawing, isDrawing } = useGates();
    const [pendingVertices, setPendingVertices] = useState<LatLon[] | null>(null);

    const closePopup = useCallback(() => {
        setPopup(null);
        setTrackedEntityId(null);
    }, [setPopup, setTrackedEntityId]);
    const focusSearch = useCallback(() => searchRef.current?.focus(), [searchRef]);
    const toggleHelp = useCallback(() => setShowHelp(!showHelp), [showHelp, setShowHelp]);
    const layerIds = useMemo(() => LAYER_IDS, []);

    useKeyboardShortcuts({
        toggleLayer,
        closePopup,
        focusSearch,
        toggleHelp,
        layerIds,
    });

    // Shortcut: G to start drawing (only when gates layer is visible and not already drawing).
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key !== 'g' && e.key !== 'G') return;
            const target = e.target as HTMLElement | null;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
            if (!isVisible('gates') || isDrawing) return;
            e.preventDefault();
            startDrawing();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isVisible, isDrawing, startDrawing]);

    // Onboarding toast when the gates layer is first toggled visible.
    const gatesVisible = isVisible('gates');
    useEffect(() => {
        if (!gatesVisible) return;
        try {
            const key = 'worldview-gates-onboarding-seen';
            if (localStorage.getItem(key)) return;
            localStorage.setItem(key, '1');
            addToast('Porter: trykk G eller + TEGN for å tegne en port. Dobbeltklikk fullfører.', 'info');
        } catch { /* ignore */ }
    }, [gatesVisible]);

    const handleRequestName = useCallback((vertices: LatLon[]) => {
        if (vertices.length < 2) {
            addToast('Port må ha minst 2 punkter.', 'error');
            return;
        }
        setPendingVertices(vertices);
    }, []);

    const handleSaveGate = useCallback((name: string, vertices: LatLon[]) => {
        addGate({ name, vertices });
        setPendingVertices(null);
    }, [addGate]);

    const handleCancelName = useCallback(() => {
        setPendingVertices(null);
    }, []);


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
                <SimulatedTrafficLayer />
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
                <WeatherRadarControls />
                <SigmetLayer />
                <RoadCameraLayer />
                <GPSJamLayer />
                <ChokepointLayer />
                <GateLayer onRequestName={handleRequestName} />
                <PlaceLabels />
                <TopBar searchRef={searchRef} />
                <LayerPanel />
                <GatePanel />
                <GateDrawHud />
                <ImageryPicker />
                <ShaderOverlayPicker />
                <PortholeOverlay />
                <HudOverlay />
                <EventLog />
                <CameraHud />
                <OrbitButton />
                <MissionControl />
                <ResetCameraButton />
                <GeoNavigator />
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
            {showHelp && <KeyboardHelpModal onClose={() => setShowHelp(false)} />}
            {pendingVertices && (
                <GateNameModal
                    vertices={pendingVertices}
                    onSave={handleSaveGate}
                    onCancel={handleCancelName}
                />
            )}
            <ToastContainer />
        </div>
    );
}

export default function App() {
    const [popup, setPopup] = useState<PopupContent | null>(null);
    const [showHelp, setShowHelp] = useState(false);
    const onSelect = useCallback((p: PopupContent | null) => setPopup(p), []);
    const searchRef = useRef<SearchBarHandle>(null);

    return (
        <AuthProvider>
        <ShaderOverlayProvider>
        <ImageryProvider>
        <LayerProvider>
        <HistoryProvider>
        <GateProvider>
        <TimelineEventProvider>
        <TrackingProvider>
        <OrbitProvider>
        <GeointProvider>
        <WeatherRadarProvider>
            <PopupRegistryProvider>
            <TooltipRegistryProvider>
            <AnalysisPanelProvider>
                <AppContent
                    popup={popup}
                    setPopup={setPopup}
                    onSelect={onSelect}
                    searchRef={searchRef}
                    showHelp={showHelp}
                    setShowHelp={setShowHelp}
                />
                <SignInGate />
            </AnalysisPanelProvider>
            </TooltipRegistryProvider>
            </PopupRegistryProvider>
        </WeatherRadarProvider>
        </GeointProvider>
        </OrbitProvider>
        </TrackingProvider>
        </TimelineEventProvider>
        </GateProvider>
        </HistoryProvider>
        </LayerProvider>
        </ImageryProvider>
        </ShaderOverlayProvider>
        </AuthProvider>
    );
}
