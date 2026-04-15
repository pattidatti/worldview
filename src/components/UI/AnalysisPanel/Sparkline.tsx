interface SparklineProps {
    values: number[];
    width?: number;
    height?: number;
    color?: string;
}

export function Sparkline({ values, width = 120, height = 32, color = 'var(--accent-green)' }: SparklineProps) {
    if (values.length < 2) {
        return (
            <svg width={width} height={height} style={{ display: 'block' }}>
                <line
                    x1={0}
                    y1={height / 2}
                    x2={width}
                    y2={height / 2}
                    stroke="rgba(255,255,255,0.1)"
                    strokeDasharray="2 2"
                />
            </svg>
        );
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const step = width / (values.length - 1);
    const points = values
        .map((v, i) => {
            const x = i * step;
            const y = height - ((v - min) / range) * (height - 2) - 1;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');
    return (
        <svg width={width} height={height} style={{ display: 'block' }}>
            <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
        </svg>
    );
}
