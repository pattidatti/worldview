interface BracketProps {
    x: number;
    y: number;
    opacity: number;
}

function Bracket({ x, y, opacity }: BracketProps) {
    return (
        <svg
            width="56"
            height="56"
            style={{
                position: 'fixed',
                left: x,
                top: y,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
                zIndex: 25,
                opacity,
                transition: 'opacity 150ms',
            }}
            fill="none"
            stroke="#ffd700"
            strokeWidth="2"
            strokeLinecap="square"
        >
            <path d="M0 14 L0 0 L14 0" />
            <path d="M42 0 L56 0 L56 14" />
            <path d="M0 42 L0 56 L14 56" />
            <path d="M56 42 L56 56 L42 56" />
        </svg>
    );
}

interface EntitySelectorProps {
    hoverPos: { x: number; y: number } | null;
    selectedPos: { x: number; y: number } | null;
}

export function EntitySelector({ hoverPos, selectedPos }: EntitySelectorProps) {
    return (
        <>
            {selectedPos && (
                <Bracket x={selectedPos.x} y={selectedPos.y} opacity={1.0} />
            )}
            {hoverPos && (
                <Bracket x={hoverPos.x} y={hoverPos.y} opacity={0.55} />
            )}
        </>
    );
}
