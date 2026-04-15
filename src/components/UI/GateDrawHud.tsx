import { useGates } from '@/context/GateContext';

export function GateDrawHud() {
    const { draw, isDrawing } = useGates();
    if (!isDrawing || !draw.active) return null;

    const count = draw.vertices.length;

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20">
            <div className="bg-[var(--bg-ui)] backdrop-blur-md border border-[var(--color-gates)]/40 rounded-xl shadow-2xl px-4 py-2 flex items-center gap-3">
                <span className="text-[var(--color-gates)] text-sm">⛩</span>
                <span className="font-mono text-xs tracking-wider text-[var(--color-gates)]">
                    TEGNER PORT
                </span>
                <span className="font-mono text-xs text-[var(--text-muted)]">
                    {count} {count === 1 ? 'punkt' : 'punkter'}
                </span>
                <span className="text-xs text-[var(--text-secondary)]">
                    Klikk = legg til · Dobbeltklikk / Enter = fullfør · Backspace = angre · Esc = avbryt
                </span>
            </div>
        </div>
    );
}
