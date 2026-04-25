import { useState } from 'react';
import { useDarkShips } from '@/context/DarkShipsContext';
import { getShipTypeName } from '@/utils/ship-utils';
import { useLayerVisibility } from '@/store/layerStore';
import { useViewer } from '@/context/ViewerContext';
import { Cartesian3 } from 'cesium';

function formatTimeSince(ms: number): string {
    const min = Math.floor(ms / 60_000);
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h}t ${m}m` : `${h}t`;
}

export function DarkShipsPanel() {
    const { darkShips } = useDarkShips();
    const visible = useLayerVisibility('ships');
    const viewer = useViewer();
    const [collapsed, setCollapsed] = useState(false);

    if (!visible || darkShips.length === 0) return null;

    const sorted = [...darkShips].sort((a, b) => {
        // Ghost-skip (forsvunnet fra AIS) vises øverst, deretter nyest-mørkt sist
        if (a.isGhost !== b.isGhost) return a.isGhost ? -1 : 1;
        return a.lastSeen - b.lastSeen;
    });

    const flyTo = (lat: number, lon: number) => {
        if (!viewer || viewer.isDestroyed()) return;
        viewer.camera.flyTo({
            destination: Cartesian3.fromDegrees(lon, lat, 400_000),
            duration: 1.8,
        });
    };

    return (
        <div className="bg-black/70 backdrop-blur-md border border-red-500/40 rounded-lg text-xs text-white w-56 overflow-hidden shadow-lg shadow-red-900/20">
            <button
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors cursor-pointer"
                onClick={() => setCollapsed(v => !v)}
            >
                <div className="flex items-center gap-2">
                    <span className="text-red-400">📵</span>
                    <span className="font-mono tracking-widest text-red-300 font-semibold">MØRKE SKIP</span>
                    <span className="bg-red-600/80 text-white rounded-full px-1.5 py-0 text-[10px] font-bold">
                        {sorted.length}
                    </span>
                </div>
                <span className="text-white/40 text-[10px]">{collapsed ? '▼' : '▲'}</span>
            </button>

            {!collapsed && (
                <div className="border-t border-red-500/20 max-h-52 overflow-y-auto">
                    {sorted.map(ship => {
                        const silentMs = Date.now() - ship.lastSeen;
                        const isGhost = ship.isGhost;
                        return (
                            <button
                                key={ship.mmsi}
                                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-red-900/20 transition-colors text-left group cursor-pointer border-b border-white/5 last:border-0"
                                onClick={() => flyTo(ship.lat, ship.lon)}
                                title={`Fly til siste kjente posisjon for ${ship.name || `MMSI ${ship.mmsi}`}`}
                            >
                                <span className="text-sm shrink-0">{isGhost ? '👻' : '📵'}</span>
                                <div className="flex-1 min-w-0">
                                    <div className="truncate font-medium text-white/90">
                                        {ship.name || `MMSI ${ship.mmsi}`}
                                    </div>
                                    <div className="text-white/40 truncate">
                                        {ship.flagState} · {getShipTypeName(ship.shipType)}
                                    </div>
                                    {isGhost && (
                                        <div className="text-red-400/70 text-[10px]">forsvant fra AIS</div>
                                    )}
                                </div>
                                <div className="text-right shrink-0">
                                    <div className={isGhost ? 'text-red-400' : 'text-yellow-400'}>
                                        {formatTimeSince(silentMs)}
                                    </div>
                                    <div className="text-white/20 group-hover:text-white/60 transition-colors text-[10px]">→</div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
