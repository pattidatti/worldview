interface HoloBeamProps {
    origin: { x: number; y: number } | null;
    color?: string;
}

export function HoloBeam({ origin, color = 'var(--accent-blue)' }: HoloBeamProps) {
    if (!origin) return null;

    // InfoPopup er fast: right: 16px, top: 56px (top-14), width: w-80 (320px)
    // Ankerpunkt: panel-senter-top
    const panelX = window.innerWidth - 16 - 160;
    const panelY = 72;

    const dx = panelX - origin.x;
    const dy = panelY - origin.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 40) return null;

    return (
        <svg
            className="fixed inset-0 pointer-events-none"
            style={{ zIndex: 19, width: '100vw', height: '100vh' }}
        >
            {/* Glow-kopi (bred, lav opacity) */}
            <line
                x1={origin.x} y1={origin.y}
                x2={panelX}    y2={panelY}
                stroke={color}
                strokeWidth="4"
                strokeOpacity="0.12"
                strokeLinecap="round"
            />
            {/* Animert streket linje */}
            <line
                x1={origin.x} y1={origin.y}
                x2={panelX}    y2={panelY}
                stroke={color}
                strokeWidth="1"
                strokeOpacity="0.55"
                strokeDasharray="4 8"
                strokeLinecap="round"
                style={{ animation: 'beam-flow 0.5s linear infinite' }}
            />
            {/* Opprinnelspunkt-sirkel */}
            <circle
                cx={origin.x} cy={origin.y}
                r="3"
                fill={color}
                fillOpacity="0.7"
            />
        </svg>
    );
}
