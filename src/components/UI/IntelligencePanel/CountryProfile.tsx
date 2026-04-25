import { type CountryFeature } from '@/utils/countryLookup';
import { type CountryIntelligence } from '@/services/countryIntelligence';
import { RiskRadar } from './RiskRadar';

function fmt(n: number): string {
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)} mrd`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)} mill`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
    return String(n);
}

function fmtGdp(gdpMd: number): string {
    const usd = gdpMd * 1e6;
    if (usd >= 1e12) return `$${(usd / 1e12).toFixed(1)}B`;
    if (usd >= 1e9) return `$${(usd / 1e9).toFixed(0)}mrd`;
    return `$${(usd / 1e6).toFixed(0)}mill`;
}

interface CounterProps {
    icon: string;
    label: string;
    value: number;
    color: string;
    loading: boolean;
}

function Counter({ icon, label, value, color, loading }: CounterProps) {
    return (
        <div className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="text-base">{icon}</span>
            <span className="font-mono text-lg font-bold tabular-nums" style={{ color }}>
                {loading ? '–' : value}
            </span>
            <span className="font-mono text-[9px] text-white/40 tracking-wider">{label}</span>
        </div>
    );
}

interface Props {
    country: CountryFeature;
    data: CountryIntelligence | null;
    loading: boolean;
}

export function CountryProfile({ country, data, loading }: Props) {
    return (
        <div className="flex flex-col gap-4 h-full overflow-y-auto pr-1">
            {/* Nøkkeldata */}
            <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[10px] text-white/30 uppercase tracking-widest">{country.continent}</span>
                    <span className="text-white/20">·</span>
                    <span className="font-mono text-[10px] text-white/30 uppercase tracking-widest">{country.subregion || country.region}</span>
                </div>
                {country.population > 0 && (
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-white/40 w-20 shrink-0">Befolkning</span>
                        <span className="font-mono text-xs text-white/70">{fmt(country.population)}</span>
                    </div>
                )}
                {country.gdpMd > 0 && (
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-white/40 w-20 shrink-0">BNP (nom.)</span>
                        <span className="font-mono text-xs text-white/70">{fmtGdp(country.gdpMd)}</span>
                    </div>
                )}
                {country.iso3 && (
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-white/40 w-20 shrink-0">ISO</span>
                        <span className="font-mono text-xs text-white/50">{country.iso3}</span>
                    </div>
                )}
            </div>

            {/* Live-tellere */}
            <div>
                <div className="font-mono text-[9px] text-white/30 tracking-widest uppercase mb-2">Live aktivitet</div>
                <div className="grid grid-cols-2 gap-2">
                    <Counter icon="✈" label="FLY" value={data?.flights.length ?? 0} color="var(--color-flights, #00d4ff)" loading={loading} />
                    <Counter icon="⚠" label="KONFLIKTER" value={data?.conflicts.length ?? 0} color="var(--color-conflicts, #ff4444)" loading={loading} />
                    <Counter icon="🌋" label="HENDELSER" value={data?.disasters.length ?? 0} color="#ff6600" loading={loading} />
                    <Counter icon="📰" label="NYHETER" value={data?.news.length ?? 0} color="var(--color-news, #ffbb00)" loading={loading} />
                </div>
            </div>

            {/* Risikoscore */}
            <div>
                <div className="font-mono text-[9px] text-white/30 tracking-widest uppercase mb-2">Risikoindikator</div>
                {loading || !data ? (
                    <div className="flex items-center justify-center h-24 text-white/20 text-xs font-mono">Laster…</div>
                ) : (
                    <RiskRadar score={data.riskScore} />
                )}
            </div>

            {/* Wikipedia */}
            {!loading && data?.wikiSummary && (
                <div>
                    <div className="font-mono text-[9px] text-white/30 tracking-widest uppercase mb-2">Om landet</div>
                    <div
                        className="rounded-xl p-3 flex flex-col gap-2"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                        {data.wikiSummary.thumbnailUrl && (
                            <a
                                href={data.wikiSummary.pageUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block overflow-hidden rounded-lg"
                            >
                                <img
                                    src={data.wikiSummary.thumbnailUrl}
                                    alt={data.wikiSummary.title}
                                    className="w-full h-24 object-cover opacity-70 hover:opacity-90 transition-opacity"
                                />
                            </a>
                        )}
                        <p className="font-mono text-[10px] text-white/55 leading-relaxed line-clamp-5">
                            {data.wikiSummary.extract}
                        </p>
                        <a
                            href={data.wikiSummary.pageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-[9px] tracking-wider self-start"
                            style={{ color: 'var(--accent-blue)' }}
                        >
                            Wikipedia →
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
}
