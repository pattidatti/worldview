import { useState, useEffect } from 'react';
import { fetchConflictRankings, type CountryRankingEntry } from '@/services/countryIntelligence';
import { useIntelligence } from '@/context/IntelligenceContext';
import { getAllCountries, getFlagEmoji } from '@/utils/countryLookup';

type RankingType = 'konflikter';

// Build a map from lowercase country name to iso2 for flag lookup
async function buildNameMap(): Promise<Map<string, string>> {
    const countries = await getAllCountries();
    const map = new Map<string, string>();
    for (const c of countries) {
        map.set(c.name.toLowerCase(), c.iso2);
        if (c.iso3) map.set(c.iso3.toLowerCase(), c.iso2);
    }
    return map;
}

export function RankingsTab() {
    const [type] = useState<RankingType>('konflikter');
    const [entries, setEntries] = useState<CountryRankingEntry[]>([]);
    const [nameMap, setNameMap] = useState<Map<string, string>>(new Map());
    const [loading, setLoading] = useState(true);
    const { openCountry } = useIntelligence();

    useEffect(() => {
        let alive = true;
        setLoading(true);
        Promise.all([fetchConflictRankings(), buildNameMap()]).then(([data, map]) => {
            if (!alive) return;
            setEntries(data);
            setNameMap(map);
            setLoading(false);
        }).catch(() => {
            if (alive) setLoading(false);
        });
        return () => { alive = false; };
    }, [type]);

    const max = entries[0]?.count ?? 1;

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center gap-3 mb-4">
                <span className="font-mono text-[10px] text-white/40 tracking-widest uppercase">Viser</span>
                <span
                    className="font-mono text-xs px-3 py-1 rounded-full"
                    style={{ background: 'rgba(255,68,68,0.12)', border: '1px solid rgba(255,68,68,0.25)', color: '#ff4444' }}
                >
                    Konflikthendelser (siste 7 dager)
                </span>
            </div>

            {loading && (
                <div className="flex items-center justify-center flex-1 text-white/20 text-xs font-mono">Laster rangeringer…</div>
            )}

            {!loading && (
                <div className="flex-1 overflow-y-auto">
                    {entries.length === 0 ? (
                        <p className="text-center text-white/20 text-xs font-mono py-8">Ingen data tilgjengelig</p>
                    ) : (
                        <div className="flex flex-col gap-1">
                            {/* Header */}
                            <div className="flex items-center gap-3 px-2 pb-1 border-b border-white/5 mb-1">
                                <span className="font-mono text-[9px] text-white/25 w-6">#</span>
                                <span className="font-mono text-[9px] text-white/25 flex-1">LAND</span>
                                <span className="font-mono text-[9px] text-white/25 w-12 text-right">ANTALL</span>
                                <span className="w-24" />
                            </div>

                            {entries.slice(0, 40).map((entry, i) => {
                                const iso2 = nameMap.get(entry.country.toLowerCase()) ?? '';
                                const flag = getFlagEmoji(iso2);
                                const barWidth = Math.round((entry.count / max) * 100);

                                return (
                                    <button
                                        key={entry.country}
                                        onClick={async () => {
                                            if (!iso2) return;
                                            const countries = await getAllCountries();
                                            const found = countries.find(c => c.iso2 === iso2);
                                            if (found) openCountry(found);
                                        }}
                                        className="w-full flex items-center gap-3 px-2 py-2 rounded hover:bg-white/5 transition-colors cursor-pointer text-left"
                                    >
                                        <span className="font-mono text-[10px] text-white/30 w-6 tabular-nums">{i + 1}</span>
                                        <span className="text-sm shrink-0">{flag}</span>
                                        <span className="font-mono text-xs text-white/70 flex-1 truncate">{entry.country}</span>
                                        <span className="font-mono text-xs text-red-400 w-12 text-right tabular-nums">{entry.count}</span>
                                        <div className="w-24 h-1 rounded-full bg-white/5 shrink-0">
                                            <div
                                                className="h-full rounded-full bg-red-500/60"
                                                style={{ width: `${barWidth}%` }}
                                            />
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
