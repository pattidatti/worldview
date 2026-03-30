const RX = 44, RY = 48;

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
                        transparent 78%,
                        rgba(0,0,0,0.55) 89%,
                        rgba(0,0,0,0.82) 96%,
                        rgba(10,10,15,0.97) 100%
                    )`,
                }}
            />
        </div>
    );
}
