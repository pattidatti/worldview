import { useEffect, useState } from 'react';
import { useVisibleLayerCount, useTotalObjectCount } from '@/store/layerStore';
import { LAYER_DEFAULTS } from '@/types/layers';
import { SearchBar, type SearchBarHandle } from './SearchBar';
import { AnimatedCount } from './AnimatedCount';
import { SignOutButton } from './SignOutButton';
import { AnalysisMenu } from './AnalysisPanel/AnalysisMenu';
import { useAnalysisPanels } from './AnalysisPanel/AnalysisPanelHost';
import { addToast } from './Toast';

function SystemClock() {
    const [time, setTime] = useState(() => new Date().toTimeString().slice(0, 8));
    useEffect(() => {
        const id = setInterval(() => setTime(new Date().toTimeString().slice(0, 8)), 1000);
        return () => clearInterval(id);
    }, []);
    return (
        <span className="font-mono text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
            {time}
        </span>
    );
}

interface TopBarProps {
    searchRef?: React.RefObject<SearchBarHandle | null>;
    onToggleHelp?: () => void;
    onToggleMobileLayers?: () => void;
    mobileLayersOpen?: boolean;
    onToggleIntelligence?: () => void;
    intelligenceOpen?: boolean;
}

export function TopBar({ searchRef, onToggleHelp, onToggleMobileLayers, mobileLayersOpen, onToggleIntelligence, intelligenceOpen }: TopBarProps) {
    const visibleLayerCount = useVisibleLayerCount();
    const totalObjects = useTotalObjectCount();
    const { addDelta, addTrend, hideAll, count } = useAnalysisPanels();
    const [menuOpen, setMenuOpen] = useState(false);

    const handleMenuToggle = () => {
        setMenuOpen((v) => !v);
        try {
            const key = 'worldview-analysis-onboarding-seen';
            if (!localStorage.getItem(key)) {
                localStorage.setItem(key, '1');
                addToast('Analyse: Delta viser endring vs historikk. Trend viser kryssinger per port.', 'info');
            }
        } catch { /* ignore */ }
    };

    return (
        <>
            {/* Øy 1: Logo (venstre) */}
            <div className="absolute top-3 left-4 z-10">
                <div
                    className="flex items-center gap-2 px-3 py-2 rounded-full bg-[var(--bg-ui-solid)] border border-white/[0.06]"
                    style={{ boxShadow: 'var(--shadow-panel)' }}
                >
                    <span
                        className="w-2 h-2 rounded-full bg-[var(--accent-blue)] shrink-0"
                        style={{ boxShadow: 'var(--glow-blue)' }}
                    />
                    <span className="font-sans text-sm font-semibold tracking-tight text-white">Worldview</span>
                    {onToggleMobileLayers && (
                        <button
                            onClick={onToggleMobileLayers}
                            className="md:hidden flex items-center justify-center w-7 h-7 rounded-full cursor-pointer transition-colors"
                            style={{
                                background: mobileLayersOpen ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.05)',
                                border: `1px solid ${mobileLayersOpen ? 'rgba(0,212,255,0.35)' : 'rgba(255,255,255,0.12)'}`,
                                color: mobileLayersOpen ? 'var(--accent-blue)' : 'var(--text-muted)',
                            }}
                            title="Vis/skjul lag"
                        >
                            <span className="text-xs">☰</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Øy 2: Søk (sentrert) */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 w-72">
                <SearchBar ref={searchRef} />
            </div>

            {/* Øy 3: Handlinger (høyre) */}
            <div className="absolute top-3 right-4 z-10">
                <div
                    className="hidden md:flex items-center gap-2 px-3 py-2 rounded-full bg-[var(--bg-ui-solid)] border border-white/[0.06]"
                    style={{ boxShadow: 'var(--shadow-panel)' }}
                >
                    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] font-mono text-xs">
                        <AnimatedCount
                            value={totalObjects}
                            color="var(--accent-green)"
                            className="text-[var(--accent-green)]"
                        />
                        <span className="text-white/30 text-[10px]">obj</span>
                    </span>
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] font-mono text-xs text-white/50">
                        <span className="text-[var(--accent-blue)]">{visibleLayerCount}</span>
                        <span className="text-white/25">/</span>
                        <span>{LAYER_DEFAULTS.length}</span>
                    </span>

                    <div className="relative">
                        <button
                            onClick={handleMenuToggle}
                            className="px-3 py-1 rounded-full font-mono text-xs tracking-widest cursor-pointer transition-all duration-200"
                            style={{
                                background: menuOpen ? 'rgba(0,255,136,0.12)' : 'rgba(0,255,136,0.06)',
                                border: '1px solid rgba(0,255,136,0.22)',
                                color: 'var(--accent-green)',
                                boxShadow: menuOpen ? 'var(--glow-green)' : 'none',
                            }}
                            title="Analyse-paneler"
                        >
                            ANALYSE{count > 0 ? ` (${count})` : ''}
                        </button>
                        {menuOpen && (
                            <AnalysisMenu
                                onAddDelta={(id) => addDelta(id)}
                                onAddTrend={(id) => addTrend(id)}
                                onHideAll={hideAll}
                                onClose={() => setMenuOpen(false)}
                            />
                        )}
                    </div>

                    {onToggleIntelligence && (
                        <button
                            onClick={onToggleIntelligence}
                            className="px-3 py-1 rounded-full font-mono text-xs tracking-widest cursor-pointer transition-all duration-200"
                            style={{
                                background: intelligenceOpen ? 'rgba(0,212,255,0.12)' : 'rgba(0,212,255,0.06)',
                                border: '1px solid rgba(0,212,255,0.22)',
                                color: 'var(--accent-blue)',
                                boxShadow: intelligenceOpen ? 'var(--glow-blue)' : 'none',
                            }}
                            title="Intelligence-panel (rangeringer og statistikk)"
                        >
                            INTEL
                        </button>
                    )}

                    <SystemClock />
                    {onToggleHelp && (
                        <button
                            onClick={onToggleHelp}
                            title="Tastatursnarveier (?)"
                            className="w-6 h-6 rounded-full flex items-center justify-center cursor-pointer transition-all font-mono text-xs"
                            style={{
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: 'var(--text-muted)',
                            }}
                        >
                            ?
                        </button>
                    )}
                    <SignOutButton />
                </div>
            </div>
        </>
    );
}
