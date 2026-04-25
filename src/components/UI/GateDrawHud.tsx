import { useGates } from '@/context/GateContext';

export function GateDrawHud() {
    const { draw, isDrawing } = useGates();
    if (!isDrawing || !draw.active) return null;

    const count = draw.vertices.length;
    const canFinish = count >= 2;

    return (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
            <div
                className="flex items-center gap-3 px-4 py-2 rounded-xl shadow-2xl backdrop-blur-md"
                style={{
                    background: 'rgba(10, 10, 20, 0.85)',
                    border: '1px solid var(--color-gates)',
                    boxShadow: '0 0 24px -4px rgba(170, 100, 255, 0.4)',
                    fontFamily: 'var(--font-mono)',
                }}
            >
                <span
                    className="animate-pulse"
                    style={{ color: 'var(--color-gates)', fontSize: '14px' }}
                >
                    ⛩
                </span>
                <span
                    className="text-xs tracking-widest font-bold"
                    style={{ color: 'var(--color-gates)' }}
                >
                    TEGNER PORT
                </span>
                <span
                    className="text-xs tabular-nums"
                    style={{ color: canFinish ? 'var(--accent-green)' : 'var(--text-muted)' }}
                >
                    {count} {count === 1 ? 'punkt' : 'punkter'}
                </span>
                <span className="w-px h-4" style={{ background: 'rgba(255,255,255,0.15)' }} />
                <span className="text-[10px] tracking-wide" style={{ color: 'rgba(255,255,255,0.55)' }}>
                    <kbd className="px-1 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.08)' }}>
                        Klikk
                    </kbd>{' '}
                    legg til ·{' '}
                    <kbd className="px-1 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.08)' }}>
                        ↵
                    </kbd>{' '}
                    fullfør ·{' '}
                    <kbd className="px-1 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.08)' }}>
                        ⌫
                    </kbd>{' '}
                    angre ·{' '}
                    <kbd className="px-1 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.08)' }}>
                        Esc
                    </kbd>{' '}
                    avbryt
                </span>
            </div>
        </div>
    );
}
