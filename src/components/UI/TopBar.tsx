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
}

export function TopBar({ searchRef }: TopBarProps) {
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
            <div className="flex items-center justify-between px-5 py-3 bg-[var(--bg-ui)] backdrop-blur-md border-b border-white/10">
                {/* Logo */}
                <div className="flex items-center gap-3">
                    <h1 className="font-mono text-base font-bold tracking-wider text-[var(--accent-blue)]">
                        WORLDVIEW
                    </h1>
                </div>

                {/* Search */}
                <SearchBar ref={searchRef} />

                {/* Status */}
                <div className="hidden md:flex items-center gap-4 font-mono text-xs text-[var(--text-muted)]">
                    <span>
                        <AnimatedCount
                            value={totalObjects}
                            color="var(--accent-green)"
                            className="text-[var(--accent-green)]"
                        />
                        {' '}objekter
                    </span>
                    <span>
                        <span className="text-[var(--accent-blue)]">{activeLayers.length}</span>
                        /{layers.length} lag
                    </span>

                    <div className="relative">
                        <button
                            onClick={handleMenuToggle}
                            className="px-2 py-1 cursor-pointer"
                            style={{
                                background: menuOpen ? 'rgba(0,255,136,0.08)' : 'rgba(10,10,20,0.65)',
                                border: '1px solid rgba(255,255,255,0.12)',
                                borderLeft: '2px solid var(--accent-green)',
                                color: 'var(--text-primary, #fff)',
                                letterSpacing: '0.08em',
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
                    <SignOutButton />
                </div>
            </div>
        </div>
    );
}
