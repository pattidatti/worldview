import { useShaderOverlay } from '@/context/ShaderOverlayContext';

const BRACKET_SIZE = 28;
const BORDER = '2px solid rgba(0, 212, 255, 0.35)';

const brackets = [
    { top: 0, left: 0,  borderTop: BORDER, borderLeft: BORDER  },
    { top: 0, right: 0, borderTop: BORDER, borderRight: BORDER },
    { bottom: 0, left: 0,  borderBottom: BORDER, borderLeft: BORDER  },
    { bottom: 0, right: 0, borderBottom: BORDER, borderRight: BORDER },
] as const;

// Color per mode
const MODE_COLOR: Record<string, string> = {
    nightvision: 'rgba(0, 255, 80, 0.55)',
    crt:         'rgba(140, 255, 140, 0.45)',
    thermal:     'rgba(255, 140, 0, 0.50)',
    anime:       'rgba(255, 100, 200, 0.60)',
};

const COMPASS = [
    { angle: 0,   label: 'N' },
    { angle: 90,  label: 'E' },
    { angle: 180, label: 'S' },
    { angle: 270, label: 'W' },
];

function ScopeOverlay({ mode }: { mode: string }) {
    const color = MODE_COLOR[mode] ?? 'rgba(0, 255, 80, 0.55)';
    const R = 42; // percent — radius of main scope circle
    const cx = 50;
    const cy = 50;

    return (
        <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 100 100"
            preserveAspectRatio="xMidYMid meet"
            style={{ zIndex: 2 }}
        >
            {/* Outer scope rings */}
            {[R, R * 0.66, R * 0.33].map((r, i) => (
                <circle
                    key={i}
                    cx={cx} cy={cy} r={r}
                    fill="none"
                    stroke={color}
                    strokeWidth={i === 0 ? 0.35 : 0.2}
                    strokeDasharray={i === 0 ? 'none' : '1.2 1.8'}
                />
            ))}

            {/* Crosshairs — horizontal */}
            <line x1={cx - R - 4} y1={cy} x2={cx - R * 0.12} y2={cy} stroke={color} strokeWidth="0.3" />
            <line x1={cx + R * 0.12} y1={cy} x2={cx + R + 4} y2={cy} stroke={color} strokeWidth="0.3" />
            {/* Crosshairs — vertical */}
            <line x1={cx} y1={cy - R - 4} x2={cx} y2={cy - R * 0.12} stroke={color} strokeWidth="0.3" />
            <line x1={cx} y1={cy + R * 0.12} x2={cx} y2={cy + R + 4} stroke={color} strokeWidth="0.3" />

            {/* Center dot */}
            <circle cx={cx} cy={cy} r={0.5} fill={color} />

            {/* Range tick marks at 45° intervals on outer ring */}
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
                const rad = (deg * Math.PI) / 180;
                const x1 = cx + Math.sin(rad) * (R - 1.2);
                const y1 = cy - Math.cos(rad) * (R - 1.2);
                const x2 = cx + Math.sin(rad) * (R + 1.2);
                const y2 = cy - Math.cos(rad) * (R + 1.2);
                return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="0.35" />;
            })}

            {/* Compass labels */}
            {COMPASS.map(({ angle, label }) => {
                const rad = (angle * Math.PI) / 180;
                const x = cx + Math.sin(rad) * (R + 5.5);
                const y = cy - Math.cos(rad) * (R + 5.5) + 0.9;
                return (
                    <text
                        key={label}
                        x={x} y={y}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill={color}
                        fontSize="3.2"
                        fontFamily="monospace"
                        fontWeight="bold"
                        letterSpacing="0.5"
                    >
                        {label}
                    </text>
                );
            })}

            {/* Range labels on rings */}
            {[
                { r: R * 0.66, label: '500m' },
                { r: R * 0.33, label: '250m' },
            ].map(({ r, label }) => (
                <text
                    key={label}
                    x={cx + r + 1} y={cy - 0.8}
                    fill={color}
                    fontSize="2.2"
                    fontFamily="monospace"
                    opacity={0.7}
                >
                    {label}
                </text>
            ))}

            {/* Mode label bottom */}
            <text
                x={cx} y={cy + R + 9}
                textAnchor="middle"
                fill={color}
                fontSize="2.8"
                fontFamily="monospace"
                opacity={0.65}
                letterSpacing="2"
            >
                {mode.toUpperCase()}
            </text>
        </svg>
    );
}

export function HudOverlay() {
    const { activeOverlay } = useShaderOverlay();
    const scopeActive = activeOverlay !== 'none';

    return (
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
            {/* Corner brackets — always visible */}
            {brackets.map((style, i) => (
                <div
                    key={i}
                    style={{
                        position: 'absolute',
                        width: BRACKET_SIZE,
                        height: BRACKET_SIZE,
                        ...style,
                    }}
                />
            ))}

            {/* Scope overlay — only in shader modes */}
            {scopeActive && <ScopeOverlay mode={activeOverlay} />}
        </div>
    );
}
