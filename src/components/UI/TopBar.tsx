import { useEffect, useState } from 'react';
import { useLayers } from '@/context/LayerContext';
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
}

export function TopBar({ searchRef, onToggleHelp, onToggleMobileLayers, mobileLayersOpen }: TopBarProps) {
    const { layers } = useLayers();
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

    const activeLayers = layers.filter((l) => l.visible);
    const totalObjects = activeLayers.reduce((sum, l) => sum + l.count, 0);

    return (
        <div className="absolute top-0 left-0 right-0 z-10">
            <div className="flex items-center justify-between px-5 py-2.5 bg-[var(--bg-ui)] backdrop-blur-xl border-b border-white/[0.06]">
                {/* Logo + mobile layers toggle */}
                <div className="flex items-center gap-3">
                    <h1 className="font-sans text-base font-semibold tracking-tight text-white flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[var(--accent-blue)] shrink-0" style={{ boxShadow: 'var(--glow-blue)' }} />
                        <span>Worldview</span>
                    </h1>
                    {onToggleMobileLayers && (
                        <button
                            onClick={onToggleMobileLayers}
                            className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg cursor-pointer transition-colors"
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

                {/* Search */}
                <SearchBar ref={searchRef} />

                {/* Status */}
                <div className="hidden md:flex items-center gap-2 font-mono text-xs">
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.08]">
                        <AnimatedCount
                            value={totalObjects}
                            color="var(--accent-green)"
                            className="text-[var(--accent-green)]"
                        />
                        <span className="text-white/30 text-[10px]">obj</span>
                    </span>
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-white/50">
                        <span className="text-[var(--accent-blue)]">{activeLayers.length}</span>
                        <span className="text-white/25">/</span>
                        <span>{layers.length}</span>
                    </span>

                    <div className="relative">
                        <button
                            onClick={handleMenuToggle}
                            className="px-3.5 py-1.5 rounded-full font-mono text-xs tracking-widest cursor-pointer transition-all duration-200"
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

                    <SystemClock />
                    {onToggleHelp && (
                        <button
                            onClick={onToggleHelp}
                            title="Tastatursnarveier (?)"
                            className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition-all font-mono text-xs"
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
        </div>
    );
}
