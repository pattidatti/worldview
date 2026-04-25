const RX = 58, RY = 62;

export function PortholeOverlay() {
    return (
        <div
            className="absolute inset-0 pointer-events-none"
            style={{ zIndex: 1 }}
        >
            <div
                className="absolute inset-0"
                style={{
                    background: `radial-gradient(
                        ellipse ${RX}% ${RY}% at 50% 50%,
                        transparent 0%,
                        transparent 88%,
                        rgba(0,0,0,0.25) 94%,
                        rgba(0,0,0,0.55) 98%,
                        rgba(0,0,0,0.72) 100%
                    )`,
                }}
            />
        </div>
    );
}
