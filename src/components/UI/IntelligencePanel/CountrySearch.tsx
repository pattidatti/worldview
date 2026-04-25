import { useState, useEffect, useRef, useMemo } from 'react';
import { getAllCountries, getFlagEmoji, type CountryFeature } from '@/utils/countryLookup';
import { useIntelligence } from '@/context/IntelligenceContext';

export function CountrySearch() {
    const { openCountry } = useIntelligence();
    const [query, setQuery] = useState('');
    const [countries, setCountries] = useState<CountryFeature[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    useEffect(() => {
        getAllCountries().then((list) =>
            setCountries(list.sort((a, b) => a.name.localeCompare(b.name)))
        );
    }, []);

    const filtered = useMemo(() => {
        if (!query.trim()) return countries.slice(0, 30);
        const q = query.toLowerCase();
        return countries
            .filter(
                (c) =>
                    c.name.toLowerCase().includes(q) ||
                    c.iso3.toLowerCase().startsWith(q) ||
                    c.iso2.toLowerCase().startsWith(q),
            )
            .slice(0, 40);
    }, [query, countries]);

    return (
        <div className="flex flex-col gap-4 h-full">
            <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl shrink-0"
                style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                }}
            >
                <span className="text-white/30 text-sm shrink-0">🔍</span>
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Søk land, ISO-kode…"
                    className="flex-1 bg-transparent outline-none font-mono text-sm text-white placeholder:text-white/25"
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') setQuery('');
                    }}
                />
                {query && (
                    <button
                        onClick={() => setQuery('')}
                        className="text-white/30 hover:text-white/60 transition-colors text-xs cursor-pointer shrink-0"
                    >
                        ✕
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
                {countries.length === 0 ? (
                    <div className="flex items-center justify-center h-24 text-white/20 text-xs font-mono">
                        Laster land…
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex items-center justify-center h-24 text-white/20 text-xs font-mono">
                        Ingen treff for «{query}»
                    </div>
                ) : (
                    <div className="flex flex-col gap-0.5">
                        {filtered.map((country) => (
                            <button
                                key={country.iso3 || country.name}
                                onClick={() => openCountry(country)}
                                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer hover:bg-white/[0.06]"
                                style={{ border: '1px solid transparent' }}
                            >
                                <span className="text-lg shrink-0 w-7 text-center">
                                    {getFlagEmoji(country.iso2)}
                                </span>
                                <span className="font-mono text-sm text-white/80 flex-1 truncate">
                                    {country.name}
                                </span>
                                <span className="font-mono text-[9px] text-white/25 shrink-0 tracking-widest">
                                    {country.iso3}
                                </span>
                                <span className="text-white/20 text-xs shrink-0">→</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
