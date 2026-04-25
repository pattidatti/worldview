import { useState } from 'react';
import { type CountryIntelligence } from '@/services/countryIntelligence';
import { type Flight } from '@/types/flight';
import { type ConflictEvent } from '@/types/conflict';
import { type Disaster } from '@/types/disaster';
import { type NewsEvent } from '@/types/news';
import { useTracking } from '@/context/TrackingContext';

type TabKey = 'fly' | 'konflikter' | 'nyheter' | 'hendelser';

const TABS: { key: TabKey; label: string; icon: string }[] = [
    { key: 'fly', label: 'Fly', icon: '✈' },
    { key: 'konflikter', label: 'Konflikter', icon: '⚠' },
    { key: 'nyheter', label: 'Nyheter', icon: '📰' },
    { key: 'hendelser', label: 'Hendelser', icon: '🌋' },
];

function fmtAlt(m: number): string {
    if (m <= 0) return 'Bakke';
    if (m >= 1000) return `${(m / 1000).toFixed(1)}km`;
    return `${Math.round(m)}m`;
}

function FlightRow({ f, onSelect }: { f: Flight; onSelect: () => void }) {
    return (
        <button
            onClick={onSelect}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 transition-colors text-left cursor-pointer"
        >
            <span className="font-mono text-xs text-[var(--accent-blue)] w-16 shrink-0 truncate">
                {f.callsign || f.icao24.toUpperCase()}
            </span>
            <span className="font-mono text-[10px] text-white/50 w-14 shrink-0">{fmtAlt(f.altitude)}</span>
            <span className="font-mono text-[10px] text-white/40 flex-1 text-right">
                {Math.round(f.velocity * 3.6)} km/t
            </span>
            <span className="text-white/20 text-xs">→</span>
        </button>
    );
}

function ConflictRow({ c }: { c: ConflictEvent }) {
    return (
        <div className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-white/5 transition-colors">
            <span className="font-mono text-[10px] text-red-400 w-20 shrink-0 truncate">{c.eventType.split('/')[0]}</span>
            <span className="font-mono text-[10px] text-white/60 flex-1 truncate">{c.actor1}</span>
            {c.fatalities > 0 && (
                <span className="font-mono text-[10px] text-red-400 shrink-0">{c.fatalities}†</span>
            )}
        </div>
    );
}

function NewsRow({ n }: { n: NewsEvent }) {
    return (
        <a
            href={n.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-white/5 transition-colors"
        >
            <span className="font-mono text-[10px] text-white/70 flex-1 line-clamp-2 leading-tight">{n.title}</span>
            <span className="font-mono text-[9px] text-white/30 shrink-0 pt-0.5">{n.domain}</span>
        </a>
    );
}

function DisasterRow({ d }: { d: Disaster }) {
    return (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 transition-colors">
            <span className="font-mono text-[10px] text-orange-400 w-24 shrink-0 truncate">{d.category}</span>
            <span className="font-mono text-[10px] text-white/60 flex-1 truncate">{d.title}</span>
            <span className="font-mono text-[9px] text-white/30 shrink-0">{d.date.slice(0, 10)}</span>
        </div>
    );
}

interface Props {
    data: CountryIntelligence | null;
    loading: boolean;
    onClose: () => void;
}

export function EntityTable({ data, loading, onClose }: Props) {
    const [activeTab, setActiveTab] = useState<TabKey>('fly');
    const { setTrackedEntityId } = useTracking();

    const counts: Record<TabKey, number> = {
        fly: data?.flights.length ?? 0,
        konflikter: data?.conflicts.length ?? 0,
        nyheter: data?.news.length ?? 0,
        hendelser: data?.disasters.length ?? 0,
    };

    const handleFlightClick = (icao24: string) => {
        setTrackedEntityId(icao24);
        onClose();
    };

    return (
        <div className="flex flex-col h-full">
            {/* Sub-tabs */}
            <div className="flex gap-1 mb-3 flex-wrap">
                {TABS.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-full font-mono text-[10px] tracking-wider cursor-pointer transition-all"
                        style={{
                            background: activeTab === tab.key ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${activeTab === tab.key ? 'rgba(0,212,255,0.35)' : 'rgba(255,255,255,0.08)'}`,
                            color: activeTab === tab.key ? 'var(--accent-blue)' : 'var(--text-muted)',
                        }}
                    >
                        <span>{tab.icon}</span>
                        <span>{tab.label}</span>
                        <span className="text-white/30">({counts[tab.key]})</span>
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto min-h-0">
                {loading && (
                    <div className="flex items-center justify-center h-24 text-white/20 text-xs font-mono">Laster…</div>
                )}
                {!loading && data && (
                    <>
                        {activeTab === 'fly' && (
                            <div>
                                {data.flights.length === 0 ? (
                                    <p className="text-center text-white/20 text-xs font-mono py-8">Ingen fly registrert</p>
                                ) : (
                                    <>
                                        {/* Column headers */}
                                        <div className="flex items-center gap-2 px-2 pb-1 border-b border-white/5 mb-1">
                                            <span className="font-mono text-[9px] text-white/25 w-16 shrink-0">KALL</span>
                                            <span className="font-mono text-[9px] text-white/25 w-14 shrink-0">HØYDE</span>
                                            <span className="font-mono text-[9px] text-white/25 flex-1 text-right">HASTIGHET</span>
                                        </div>
                                        {data.flights.slice(0, 50).map((f) => (
                                            <FlightRow key={f.icao24} f={f} onSelect={() => handleFlightClick(f.icao24)} />
                                        ))}
                                    </>
                                )}
                            </div>
                        )}
                        {activeTab === 'konflikter' && (
                            <div>
                                {data.conflicts.length === 0 ? (
                                    <p className="text-center text-white/20 text-xs font-mono py-8">Ingen konflikthendelser registrert</p>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-2 px-2 pb-1 border-b border-white/5 mb-1">
                                            <span className="font-mono text-[9px] text-white/25 w-20 shrink-0">TYPE</span>
                                            <span className="font-mono text-[9px] text-white/25 flex-1">AKTØR</span>
                                            <span className="font-mono text-[9px] text-white/25 shrink-0">TAPTE</span>
                                        </div>
                                        {data.conflicts.slice(0, 50).map((c) => (
                                            <ConflictRow key={c.id} c={c} />
                                        ))}
                                    </>
                                )}
                            </div>
                        )}
                        {activeTab === 'nyheter' && (
                            <div>
                                {data.news.length === 0 ? (
                                    <p className="text-center text-white/20 text-xs font-mono py-8">Ingen nyheter registrert</p>
                                ) : (
                                    data.news.slice(0, 50).map((n) => (
                                        <NewsRow key={n.id} n={n} />
                                    ))
                                )}
                            </div>
                        )}
                        {activeTab === 'hendelser' && (
                            <div>
                                {data.disasters.length === 0 ? (
                                    <p className="text-center text-white/20 text-xs font-mono py-8">Ingen aktive hendelser</p>
                                ) : (
                                    data.disasters.slice(0, 50).map((d) => (
                                        <DisasterRow key={d.id} d={d} />
                                    ))
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
