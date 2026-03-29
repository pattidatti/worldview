import { useState } from 'react';
import { useLayers } from '@/context/LayerContext';
import { type LayerConfig, LAYER_ICONS } from '@/types/layers';

function formatTimeAgo(ts: number): string {
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 60) return 'Nå';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m siden`;
    return `${Math.floor(min / 60)}t siden`;
}

function LayerToggle({ layer }: { layer: LayerConfig }) {
    const { toggleLayer } = useLayers();

    return (
        <button
            onClick={() => toggleLayer(layer.id)}
            className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg transition-all duration-200 cursor-pointer
                ${layer.visible ? 'bg-white/5' : 'bg-transparent opacity-40'}
                hover:bg-white/10`}
        >
            <span className="text-base w-6 text-center">{LAYER_ICONS[layer.id]}</span>
            <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: layer.visible ? layer.color : '#555' }}
            />
            <span className="font-sans text-sm text-[var(--text-secondary)] flex-1 text-left">
                {layer.name}
            </span>
            {layer.loading ? (
                <span className="text-xs text-[var(--text-muted)] animate-pulse">...</span>
            ) : layer.error ? (
                <span className="text-xs text-orange-400" title={layer.error}>⚠</span>
            ) : layer.count > 0 ? (
                <span
                    className="font-mono text-xs text-[var(--text-muted)]"
                    title={layer.lastUpdated ? `Sist oppdatert: ${formatTimeAgo(layer.lastUpdated)}` : undefined}
                >
                    {layer.count.toLocaleString('nb-NO')}
                </span>
            ) : layer.visible ? (
                <span className="text-xs text-[var(--text-muted)] italic">Ingen</span>
            ) : null}
        </button>
    );
}

export function LayerPanel() {
    const { layers } = useLayers();
    const [collapsed, setCollapsed] = useState(false);

    return (
        <div className="absolute bottom-6 left-6 z-10">
            <div className="bg-[var(--bg-ui)] backdrop-blur-md border border-white/10 rounded-xl overflow-hidden shadow-2xl">
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="flex items-center justify-between w-full px-4 py-2.5 cursor-pointer hover:bg-white/5 transition-colors"
                >
                    <span className="font-mono text-xs tracking-wider text-[var(--accent-blue)] uppercase">
                        Datalag
                    </span>
                    <span className="text-[var(--text-muted)] text-xs ml-4">
                        {collapsed ? '▲' : '▼'}
                    </span>
                </button>

                {!collapsed && (
                    <div className="px-2 pb-2 flex flex-col gap-0.5">
                        {layers.map((layer) => (
                            <LayerToggle key={layer.id} layer={layer} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
