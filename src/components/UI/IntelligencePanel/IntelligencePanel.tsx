import { useEffect } from 'react';
import { useIntelligence, type IntelligenceMode } from '@/context/IntelligenceContext';
import { getFlagEmoji } from '@/utils/countryLookup';
import { CountryProfile } from './CountryProfile';
import { CountrySearch } from './CountrySearch';
import { EntityTable } from './EntityTable';
import { RankingsTab } from './RankingsTab';
import { StatisticsTab } from './StatisticsTab';

const TABS: { key: IntelligenceMode; label: string }[] = [
    { key: 'country', label: 'Land-profil' },
    { key: 'rankings', label: 'Rangeringer' },
    { key: 'statistics', label: 'Statistikk' },
];

export function IntelligencePanel() {
    const { isOpen, mode, selectedCountry, countryData, loading, setMode, close } = useIntelligence();

    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [isOpen, close]);

    if (!isOpen) return null;

    const flag = selectedCountry ? getFlagEmoji(selectedCountry.iso2) : null;
    const countryName = selectedCountry?.name ?? null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
            onClick={close}
        >
            <div
                className="relative w-full max-w-5xl h-[85vh] flex flex-col rounded-2xl overflow-hidden"
                style={{
                    background: 'var(--bg-ui)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    boxShadow: 'var(--shadow-panel)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    className="flex items-center gap-3 px-5 py-3 shrink-0"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                >
                    {/* Country name or title */}
                    <div className="flex items-center gap-2 min-w-0">
                        {flag && <span className="text-xl shrink-0">{flag}</span>}
                        <span className="font-mono text-sm font-bold text-white truncate">
                            {countryName ?? (mode === 'country' ? 'Søk land' : 'Verdensanalyse')}
                        </span>
                        {loading && (
                            <span className="font-mono text-[9px] text-white/30 tracking-widest animate-pulse ml-1">LASTER…</span>
                        )}
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-1 ml-4">
                        {TABS.map((tab) => {
                            const active = mode === tab.key;
                            return (
                                <button
                                    key={tab.key}
                                    onClick={() => setMode(tab.key)}
                                    className="font-mono text-[10px] tracking-wider px-3 py-1 rounded-full cursor-pointer transition-all"
                                    style={{
                                        background: active ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.04)',
                                        border: `1px solid ${active ? 'rgba(0,212,255,0.35)' : 'rgba(255,255,255,0.08)'}`,
                                        color: active ? 'var(--accent-blue)' : 'var(--text-muted)',
                                        boxShadow: active ? 'var(--glow-blue)' : 'none',
                                    }}
                                >
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex-1" />

                    {/* Close */}
                    <button
                        onClick={close}
                        className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition-all font-mono text-sm text-white/40 hover:text-white hover:bg-white/10"
                    >
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 min-h-0 p-5">
                    {mode === 'country' && (
                        selectedCountry ? (
                            <div className="flex gap-5 h-full">
                                {/* Left column */}
                                <div
                                    className="w-56 shrink-0 overflow-y-auto pr-3"
                                    style={{ borderRight: '1px solid rgba(255,255,255,0.05)' }}
                                >
                                    <CountryProfile country={selectedCountry} data={countryData} loading={loading} />
                                </div>
                                {/* Right column */}
                                <div className="flex-1 min-w-0">
                                    <EntityTable data={countryData} loading={loading} onClose={close} />
                                </div>
                            </div>
                        ) : (
                            <CountrySearch />
                        )
                    )}
                    {mode === 'rankings' && <RankingsTab />}
                    {mode === 'statistics' && <StatisticsTab />}
                </div>
            </div>
        </div>
    );
}
