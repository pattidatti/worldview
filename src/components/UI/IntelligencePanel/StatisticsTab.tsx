import { useLayerStore } from '@/store/layerStore';
import { LAYER_DEFAULTS } from '@/types/layers';

export function StatisticsTab() {
    const status = useLayerStore((s) => s.status);
    const meta = useLayerStore((s) => s.meta);
    const visibility = useLayerStore((s) => s.visibility);

    const activeLayers = LAYER_DEFAULTS
        .filter((l) => visibility[l.id] && (status[l.id]?.count ?? 0) > 0)
        .map((l) => ({
            id: l.id,
            name: meta[l.id]?.name ?? l.name,
            color: meta[l.id]?.color ?? l.color,
            count: status[l.id]?.count ?? 0,
            lastUpdated: status[l.id]?.lastUpdated,
        }))
        .sort((a, b) => b.count - a.count);

    const total = activeLayers.reduce((sum, l) => sum + l.count, 0);
    const maxCount = activeLayers[0]?.count ?? 1;

    function fmtTime(ts: number | null | undefined): string {
        if (!ts) return '–';
        const diff = Math.round((Date.now() - ts) / 1000);
        if (diff < 60) return `${diff}s siden`;
        if (diff < 3600) return `${Math.round(diff / 60)}m siden`;
        return `${Math.round(diff / 3600)}t siden`;
    }

    return (
        <div className="flex flex-col h-full">
            {/* Summary */}
            <div className="flex items-center gap-4 mb-4 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex flex-col">
                    <span className="font-mono text-2xl font-bold tabular-nums" style={{ color: 'var(--accent-green)' }}>
                        {total.toLocaleString('nb-NO')}
                    </span>
                    <span className="font-mono text-[9px] text-white/30 tracking-widest uppercase">Totale enheter</span>
                </div>
                <div className="w-px h-10 bg-white/10" />
                <div className="flex flex-col">
                    <span className="font-mono text-2xl font-bold tabular-nums text-white/70">{activeLayers.length}</span>
                    <span className="font-mono text-[9px] text-white/30 tracking-widest uppercase">Aktive lag</span>
                </div>
            </div>

            {/* Layer bars */}
            <div className="flex-1 overflow-y-auto">
                {activeLayers.length === 0 ? (
                    <p className="text-center text-white/20 text-xs font-mono py-8">Ingen aktive lag med data</p>
                ) : (
                    <div className="flex flex-col gap-2">
                        {/* Header */}
                        <div className="flex items-center gap-3 px-2 pb-1 border-b border-white/5 mb-1">
                            <span className="font-mono text-[9px] text-white/25 flex-1">LAG</span>
                            <span className="font-mono text-[9px] text-white/25 w-14 text-right">ANTALL</span>
                            <span className="font-mono text-[9px] text-white/25 w-16 text-right">OPPDATERT</span>
                        </div>

                        {activeLayers.map((layer) => {
                            const barWidth = Math.round((layer.count / maxCount) * 100);
                            return (
                                <div key={layer.id} className="flex flex-col gap-1 px-2 py-1.5 rounded hover:bg-white/3 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <span
                                            className="w-2 h-2 rounded-full shrink-0"
                                            style={{ backgroundColor: layer.color, boxShadow: `0 0 4px ${layer.color}` }}
                                        />
                                        <span className="font-mono text-xs text-white/70 flex-1 truncate">{layer.name}</span>
                                        <span className="font-mono text-xs tabular-nums" style={{ color: layer.color }}>
                                            {layer.count.toLocaleString('nb-NO')}
                                        </span>
                                        <span className="font-mono text-[9px] text-white/25 w-16 text-right">{fmtTime(layer.lastUpdated)}</span>
                                    </div>
                                    <div className="h-0.5 rounded-full bg-white/5 ml-5">
                                        <div
                                            className="h-full rounded-full transition-all duration-500"
                                            style={{ width: `${barWidth}%`, backgroundColor: layer.color, opacity: 0.6 }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
