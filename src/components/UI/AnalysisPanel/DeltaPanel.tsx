import { useLayers } from '@/context/LayerContext';
import { useHistory } from '@/context/HistoryContext';
import { useRollingStats } from '@/hooks/useRollingStats';
import { LAYER_ICONS, type LayerId } from '@/types/layers';
import { AnalysisPanelFrame } from './AnalysisPanelFrame';
import { Sparkline } from './Sparkline';
import type { DragPosition } from '@/hooks/useDrag';

interface DeltaPanelProps {
    layerId: LayerId;
    position: DragPosition;
    onPositionChange: (pos: DragPosition) => void;
    onClose: () => void;
}

function formatDelta(delta: number | null): { text: string; color: string } {
    if (delta == null) return { text: '—', color: 'var(--text-muted)' };
    const sign = delta > 0 ? '+' : '';
    const color = delta > 0 ? 'var(--accent-green)' : delta < 0 ? 'var(--accent-red, #ff6666)' : 'var(--text-muted)';
    return { text: `${sign}${delta.toFixed(0)}`, color };
}

export function DeltaPanel({ layerId, position, onPositionChange, onClose }: DeltaPanelProps) {
    const { layers } = useLayers();
    const { loading, error } = useHistory();
    const stats = useRollingStats(layerId);

    const layer = layers.find((l) => l.id === layerId);
    const name = layer?.name ?? layerId;
    const icon = LAYER_ICONS[layerId] ?? '◆';

    const samples = stats.samples.slice(-360); // siste 6t ved 60s-kadens

    const samplesCount = stats.samples.length;
    const baselineProgressSec = Math.min(60, samplesCount);

    return (
        <AnalysisPanelFrame
            title={`Δ ${name}`}
            subtitle={`${icon} ${layerId}`}
            initialPosition={position}
            onPositionChange={onPositionChange}
            onClose={onClose}
            width={280}
        >
            <div className="flex flex-col gap-3 text-xs">
                {!stats.hasBaseline ? (
                    <div style={{ color: 'var(--text-muted)' }}>
                        Samler baseline… {baselineProgressSec}s
                    </div>
                ) : error ? (
                    <div style={{ color: 'var(--accent-red, #ff6666)' }}>
                        Historikk utilgjengelig — viser kun live
                    </div>
                ) : loading ? (
                    <div style={{ color: 'var(--text-muted)' }}>Henter historikk…</div>
                ) : null}

                <div className="flex items-baseline gap-2">
                    <span className="text-2xl tabular-nums" style={{ color: 'var(--accent-blue)' }}>
                        {stats.current.toLocaleString('nb-NO')}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        NÅ
                    </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                    {([
                        ['1t', stats.delta1h],
                        ['24t', stats.delta24h],
                        ['7d', stats.delta7d],
                    ] as const).map(([label, delta]) => {
                        const f = formatDelta(delta);
                        return (
                            <div key={label} className="flex flex-col">
                                <span style={{ color: 'var(--text-muted)', fontSize: 9, letterSpacing: '0.08em' }}>
                                    VS {label.toUpperCase()}
                                </span>
                                <span className="tabular-nums" style={{ color: f.color }}>
                                    {f.text}
                                </span>
                            </div>
                        );
                    })}
                </div>

                <div style={{ opacity: 0.8 }}>
                    <Sparkline values={samples.map((s) => s.count)} width={256} height={40} />
                    <div className="flex justify-between" style={{ color: 'var(--text-muted)', fontSize: 9 }}>
                        <span>−6t</span>
                        <span>NÅ</span>
                    </div>
                </div>
            </div>
        </AnalysisPanelFrame>
    );
}
