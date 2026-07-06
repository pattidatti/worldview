import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { type Entity } from 'cesium';
import { AppProviders } from './app/AppProviders';
import { TimelineBar } from './components/UI/Timeline/TimelineBar';
import { SignInGate } from './components/UI/SignInGate';
import { useGates } from './context/GateContext';
import { GateLayer } from './components/Layers/GateLayer/GateLayer';
import { GateNameModal } from './components/UI/GateNameModal';
import { GateDrawHud } from './components/UI/GateDrawHud';
import { GatePanel } from './components/UI/GatePanel';
import { addToast } from './components/UI/Toast';
import type { LatLon } from './types/gate';
import { GlobeViewer } from './components/Globe/GlobeViewer';
import { useLayerActions, useLayerVisibility } from './store/layerStore';
import { useTooltipRegistry } from './context/TooltipRegistry';
import { TopBar } from './components/UI/TopBar';
import { LayerPanel } from './components/UI/LayerPanel';
import { InfoPopup } from './components/UI/InfoPopup';
import { HoloBeam } from './components/UI/HoloBeam';
import { EntityTooltip } from './components/UI/EntityTooltip';
import { ToastContainer } from './components/UI/Toast';
import { LayerErrorWatcher } from './components/UI/LayerErrorWatcher';
import { SatelliteLayer } from './components/Layers/SatelliteLayer/SatelliteLayer';
import { FlightLayer } from './components/Layers/FlightLayer';
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
import { AsteroidLayer } from './components/Layers/AsteroidLayer/AsteroidLayer';
import { TensionLayer } from './components/Layers/TensionLayer/TensionLayer';
import { PointLayers } from './components/Layers/PointLayer';
import { WeatherRadarLayer } from './components/Layers/WeatherRadarLayer/WeatherRadarLayer';
import { WeatherRadarControls } from './components/UI/WeatherRadarControls';
import { SigmetLayer } from './components/Layers/SigmetLayer/SigmetLayer';
import { RoadCameraLayer } from './components/Layers/RoadCameraLayer/RoadCameraLayer';
import { GPSJamLayer } from './components/Layers/GPSJamLayer/GPSJamLayer';
import { ChokepointLayer } from './components/Layers/ChokepointLayer/ChokepointLayer';
import { ISSLayer } from './components/Layers/ISSLayer/ISSLayer';
import { LightningLayer } from './components/Layers/LightningLayer/LightningLayer';
import { HeritageLayer } from './components/Heritage/HeritageLayer';
import { PlaceLabels } from './components/Globe/PlaceLabels';
import { HudOverlay } from './components/UI/HudOverlay';
import { FpsOverlay } from './components/UI/FpsOverlay';
import { PortholeOverlay } from './components/UI/PortholeOverlay';
import { useTracking } from './context/TrackingContext';
import { HudDock } from './components/UI/HudDock/HudDock';
import { OnboardingTour } from './components/UI/OnboardingTour';
import { CommandPalette } from './components/UI/CommandPalette';
import { GeoNavigator } from './components/UI/GeoNavigator';
import { DarkShipsPanel } from './components/UI/DarkShipsPanel';
import { KeyboardHelpModal } from './components/UI/KeyboardHelpModal';
import { IntelligencePanel } from './components/UI/IntelligencePanel/IntelligencePanel';
import { useIntelligence } from './context/IntelligenceContext';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useHoverTooltip } from './hooks/useHoverTooltip';
import { useEntityScreenPos } from './hooks/useEntityScreenPos';
import { usePrimitiveScreenPos } from './hooks/usePrimitiveScreenPos';
import { EntitySelector } from './components/UI/EntitySelector';
import { useViewer } from './context/ViewerContext';
import { LAYER_DEFAULTS } from './types/layers';
import { type PopupContent } from './types/popup';
import { type SearchBarHandle } from './components/UI/SearchBar';

const LAYER_IDS = LAYER_DEFAULTS.map((l) => l.id);

function TooltipHandler({ selectedEntity, selectedPrimitiveId }: { selectedEntity: Entity | null; selectedPrimitiveId: string | null }) {
    const viewer = useViewer();
    const { resolve, resolveById } = useTooltipRegistry();
    const { isDrawingRef } = useGates();
    const hover = useHoverTooltip(viewer, resolve, isDrawingRef, resolveById);
    const entityPos = useEntityScreenPos(viewer, selectedEntity);
    const primitivePos = usePrimitiveScreenPos(viewer, selectedPrimitiveId);
    const selectedPos = entityPos ?? primitivePos;
    const hoverPos = hover ? { x: hover.entityX, y: hover.entityY } : null;
    return (
        <>
            {hover && <EntityTooltip hover={hover} />}
            <EntitySelector hoverPos={hoverPos} selectedPos={selectedPos} />
        </>
    );
}

function InfoPopupController({
    popup,
    selectedEntity,
    selectedPrimitiveId,
    onClose,
    onFollow,
    trackedEntityId,
}: {
    popup: PopupContent;
    selectedEntity: Entity | null;
    selectedPrimitiveId: string | null;
    onClose: () => void;
    onFollow: (id: string | null) => void;
    trackedEntityId: string | null;
}) {
    const viewer = useViewer();
    const entityPos = useEntityScreenPos(viewer, selectedEntity);
    const primitivePos = usePrimitiveScreenPos(viewer, selectedPrimitiveId);
    const livePos = entityPos ?? primitivePos;
    const livePosRef = useRef(livePos);
    livePosRef.current = livePos;
    const [originPos, setOriginPos] = useState<{ x: number; y: number } | null>(null);

    // Snapshot entity skjermposisjon ved popup-åpning (etter én rAF for å la entity rendres)
    useEffect(() => {
        const id = requestAnimationFrame(() => {
            setOriginPos(livePosRef.current);
        });
        return () => cancelAnimationFrame(id);
    }, [popup]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <>
            <HoloBeam origin={originPos} color={popup.color} />
            <InfoPopup
                content={popup}
                onClose={onClose}
                onFollow={onFollow}
                isFollowing={trackedEntityId !== null && trackedEntityId === popup.followEntityId}
                originPos={originPos}
            />
        </>
    );
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
    const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
    const [selectedPrimitiveId, setSelectedPrimitiveId] = useState<string | null>(null);
    const { toggleLayer } = useLayerActions();
    const gatesVisible = useLayerVisibility('gates');
    const { trackedEntityId, setTrackedEntityId } = useTracking();
    const { addGate, startDrawing, isDrawing } = useGates();
    const [pendingVertices, setPendingVertices] = useState<LatLon[] | null>(null);
    const [showCommandPalette, setShowCommandPalette] = useState(false);
    const [mobileLayersOpen, setMobileLayersOpen] = useState(false);
    const { openAt: openIntelligenceAt, openSearch, isOpen: intelligenceOpen } = useIntelligence();

    const handleBackgroundClick = useCallback(async (lat: number, lon: number) => {
        const handled = await openIntelligenceAt(lat, lon);
        if (!handled) {
            // No country found — clear selection
            onSelect(null);
        }
    }, [openIntelligenceAt, onSelect]);

    const closePopup = useCallback(() => {
        setPopup(null);
        setTrackedEntityId(null);
        setSelectedEntity(null);
        setSelectedPrimitiveId(null);
    }, [setPopup, setTrackedEntityId]);

    // Primitive-valg (V2-lag uten Cesium Entity) speiler popup-livssyklusen:
    // nullstill når popup lukkes (bakgrunnsklikk, Esc, X) uansett close-sti.
    useEffect(() => {
        if (!popup) setSelectedPrimitiveId(null);
    }, [popup]);
    const focusSearch = useCallback(() => searchRef.current?.focus(), [searchRef]);
    const toggleHelp = useCallback(() => setShowHelp(!showHelp), [showHelp, setShowHelp]);
    const openCommandPalette = useCallback(() => setShowCommandPalette(true), []);
    const layerIds = useMemo(() => LAYER_IDS, []);

    useKeyboardShortcuts({
        toggleLayer,
        closePopup,
        focusSearch,
        toggleHelp,
        openCommandPalette,
        layerIds,
    });

    // Shortcut: G to start drawing (only when gates layer is visible and not already drawing).
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key !== 'g' && e.key !== 'G') return;
            const target = e.target as HTMLElement | null;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
            if (!gatesVisible || isDrawing) return;
            e.preventDefault();
            startDrawing();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [gatesVisible, isDrawing, startDrawing]);

    // Onboarding toast when the gates layer is first toggled visible.
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
            <GlobeViewer onSelect={onSelect} onEntitySelect={(e) => { setSelectedEntity(e ?? null); if (e) setSelectedPrimitiveId(null); }} onPrimitiveSelect={setSelectedPrimitiveId} onBackgroundClick={handleBackgroundClick}>
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
                <AsteroidLayer />
                <PointLayers />
                <TensionLayer />
                <WeatherRadarLayer />
                <WeatherRadarControls />
                <SigmetLayer />
                <RoadCameraLayer />
                <GPSJamLayer />
                <ChokepointLayer />
                <ISSLayer />
                <LightningLayer />
                <GateLayer onRequestName={handleRequestName} />
                <HeritageLayer />
                <PlaceLabels />
                <TopBar searchRef={searchRef} onToggleHelp={toggleHelp} onToggleMobileLayers={() => setMobileLayersOpen((v) => !v)} mobileLayersOpen={mobileLayersOpen} onToggleIntelligence={openSearch} intelligenceOpen={intelligenceOpen} />
                <LayerPanel mobileOpen={mobileLayersOpen} />
                {/* Top-right panel: GatePanel + DarkShipsPanel */}
                <div className="absolute top-14 right-4 z-10 w-48">
                    <GatePanel />
                </div>
                <div className="absolute top-36 right-4 z-10">
                    <DarkShipsPanel />
                </div>
                <GateDrawHud />
                <PortholeOverlay />
                <HudOverlay />
                <FpsOverlay />
                <HudDock />
                <GeoNavigator />
                <TimelineBar />
                <LayerErrorWatcher />
                {popup && (
                    <InfoPopupController
                        popup={popup}
                        selectedEntity={selectedEntity}
                        selectedPrimitiveId={selectedPrimitiveId}
                        onClose={closePopup}
                        onFollow={setTrackedEntityId}
                        trackedEntityId={trackedEntityId}
                    />
                )}
                <TooltipHandler selectedEntity={selectedEntity} selectedPrimitiveId={selectedPrimitiveId} />
            </GlobeViewer>
            <IntelligencePanel />
            {showHelp && <KeyboardHelpModal onClose={() => setShowHelp(false)} />}
            {showCommandPalette && <CommandPalette onClose={() => setShowCommandPalette(false)} />}
            {pendingVertices && (
                <GateNameModal
                    vertices={pendingVertices}
                    onSave={handleSaveGate}
                    onCancel={handleCancelName}
                />
            )}
            <OnboardingTour />
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
        <AppProviders>
            <AppContent
                popup={popup}
                setPopup={setPopup}
                onSelect={onSelect}
                searchRef={searchRef}
                showHelp={showHelp}
                setShowHelp={setShowHelp}
            />
            <SignInGate />
        </AppProviders>
    );
}
