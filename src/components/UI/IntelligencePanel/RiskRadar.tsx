import { type RiskScore } from '@/services/countryIntelligence';

const AXES: { key: keyof RiskScore; label: string; color: string }[] = [
    { key: 'militarisering', label: 'Militær', color: '#ff4444' },
    { key: 'okonomi', label: 'Økonomi', color: '#ffaa00' },
    { key: 'gps', label: 'GPS', color: '#00d4ff' },
    { key: 'natur', label: 'Natur', color: '#44ff88' },
    { key: 'nyheter', label: 'Nyheter', color: '#bb88ff' },
];

const SIZE = 160;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 60;

function axisPoint(i: number, r: number): { x: number; y: number } {
    const angle = (i * 2 * Math.PI) / AXES.length - Math.PI / 2;
    return {
        x: CX + r * Math.cos(angle),
        y: CY + r * Math.sin(angle),
    };
}

export function RiskRadar({ score }: { score: RiskScore }) {
    const gridLevels = [0.25, 0.5, 0.75, 1.0];

    const dataPoints = AXES.map((axis, i) => {
        const val = (score[axis.key] / 100) * R;
        return axisPoint(i, val);
    });
    const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z';

    return (
        <div className="flex flex-col items-center gap-1">
            <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
                {/* Grid rings */}
                {gridLevels.map((level) => {
                    const pts = AXES.map((_, i) => axisPoint(i, R * level));
                    const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z';
                    return <path key={level} d={path} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />;
                })}

                {/* Axis lines */}
                {AXES.map((_, i) => {
                    const tip = axisPoint(i, R);
                    return (
                        <line key={i} x1={CX} y1={CY} x2={tip.x} y2={tip.y} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
                    );
                })}

                {/* Data polygon */}
                <path d={dataPath} fill="rgba(255,68,68,0.15)" stroke="#ff4444" strokeWidth="1.5" />

                {/* Axis labels */}
                {AXES.map((axis, i) => {
                    const tip = axisPoint(i, R + 16);
                    return (
                        <text
                            key={i}
                            x={tip.x}
                            y={tip.y}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontSize="8"
                            fill={axis.color}
                            fontFamily="monospace"
                        >
                            {axis.label}
                        </text>
                    );
                })}

                {/* Data points */}
                {dataPoints.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={AXES[i].color} />
                ))}
            </svg>

            {/* Score bars */}
            <div className="w-full flex flex-col gap-0.5 mt-1">
                {AXES.map((axis) => (
                    <div key={axis.key} className="flex items-center gap-2">
                        <span className="font-mono text-[9px] w-14 shrink-0" style={{ color: axis.color }}>
                            {axis.label.toUpperCase()}
                        </span>
                        <div className="flex-1 h-1 rounded-full bg-white/5">
                            <div
                                className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${score[axis.key]}%`, backgroundColor: axis.color, opacity: 0.8 }}
                            />
                        </div>
                        <span className="font-mono text-[9px] w-5 text-right text-white/40">
                            {score[axis.key]}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
