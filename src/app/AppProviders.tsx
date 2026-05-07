import { type ReactNode } from 'react';
import { AuthProvider } from '@/context/AuthContext';
import { HistoryProvider } from '@/context/HistoryContext';
import { TimelineModeProvider } from '@/context/TimelineModeContext';
import { GateProvider } from '@/context/GateContext';
import { TimelineEventProvider } from '@/context/TimelineEventContext';
import { PopupRegistryProvider } from '@/context/PopupRegistry';
import { TooltipRegistryProvider } from '@/context/TooltipRegistry';
import { ImageryProvider } from '@/context/ImageryContext';
import { SceneProjectionProvider } from '@/context/SceneProjectionContext';
import { ShaderOverlayProvider } from '@/context/ShaderOverlayContext';
import { TrackingProvider } from '@/context/TrackingContext';
import { OrbitProvider } from '@/context/OrbitContext';
import { CinematicProvider } from '@/context/CinematicContext';
import { GeointProvider } from '@/context/GeointContext';
import { WeatherRadarProvider } from '@/context/WeatherRadarContext';
import { AnalysisPanelProvider } from '@/components/UI/AnalysisPanel/AnalysisPanelHost';
import { DarkShipsProvider } from '@/context/DarkShipsContext';
import { IntelligenceProvider } from '@/context/IntelligenceContext';

/** Auth + Firestore-avhengige contexts (timeline replay, gates, events). */
function TimelineStateProviders({ children }: { children: ReactNode }) {
    return (
        <HistoryProvider>
            <TimelineModeProvider>
                <GateProvider>
                    <TimelineEventProvider>{children}</TimelineEventProvider>
                </GateProvider>
            </TimelineModeProvider>
        </HistoryProvider>
    );
}

/** Visuelle preferanser som kan endres av bruker (rendering-relatert). */
function ViewProviders({ children }: { children: ReactNode }) {
    return (
        <ShaderOverlayProvider>
            <SceneProjectionProvider>
                <ImageryProvider>
                    <WeatherRadarProvider>{children}</WeatherRadarProvider>
                </ImageryProvider>
            </SceneProjectionProvider>
        </ShaderOverlayProvider>
    );
}

/** Kamera- og interaksjons-state (tracking, orbit, geoint-overlay). */
function InteractionProviders({ children }: { children: ReactNode }) {
    return (
        <TrackingProvider>
            <OrbitProvider>
                <CinematicProvider>
                    <GeointProvider>{children}</GeointProvider>
                </CinematicProvider>
            </OrbitProvider>
        </TrackingProvider>
    );
}

/** UI-event-buses (popup-, tooltip-, analyse-registry og dark ships). */
function UiProviders({ children }: { children: ReactNode }) {
    return (
        <PopupRegistryProvider>
            <TooltipRegistryProvider>
                <AnalysisPanelProvider>
                    <DarkShipsProvider>
                        <IntelligenceProvider>{children}</IntelligenceProvider>
                    </DarkShipsProvider>
                </AnalysisPanelProvider>
            </TooltipRegistryProvider>
        </PopupRegistryProvider>
    );
}

/**
 * Samler alle contexts i fire logiske grupper for lettere navigering.
 * LayerContext er Zustand (providerless) og trenger ikke wrapping.
 */
export function AppProviders({ children }: { children: ReactNode }) {
    return (
        <AuthProvider>
            <ViewProviders>
                <TimelineStateProviders>
                    <InteractionProviders>
                        <UiProviders>{children}</UiProviders>
                    </InteractionProviders>
                </TimelineStateProviders>
            </ViewProviders>
        </AuthProvider>
    );
}
