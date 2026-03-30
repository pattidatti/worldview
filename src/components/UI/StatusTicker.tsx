import { useLayers } from '@/context/LayerContext';

export function StatusTicker() {
    const { layers } = useLayers();
    const active = layers.filter((l) => l.visible && l.count > 0);

    if (active.length === 0) return null;

    return (
        <div
            className="absolute bottom-0 left-0 right-0 z-10 flex items-center overflow-hidden"
            style={{
                height: '36px',
                background: 'rgba(10, 10, 20, 0.75)',
                backdropFilter: 'blur(8px)',
                borderTop: '1px solid rgba(255,255,255,0.07)',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                letterSpacing: '0.06em',
                paddingLeft: '1rem',
                paddingRight: '1rem',
                gap: '0',
            }}
        >
            <span style={{ color: 'rgba(0, 212, 255, 0.5)', marginRight: '12px' }}>◈</span>
            <div className="flex items-center gap-0 overflow-hidden" style={{ whiteSpace: 'nowrap' }}>
                {active.map((l, i) => (
                    <span key={l.id} className="flex items-center">
                        {i > 0 && (
                            <span style={{ color: 'rgba(255,255,255,0.15)', margin: '0 10px' }}>·</span>
                        )}
                        <span style={{ color: l.color, opacity: 0.8 }}>{l.name.toUpperCase()}</span>
                        <span style={{ color: 'rgba(255,255,255,0.35)', marginLeft: '5px' }}>
                            {l.count.toLocaleString('nb-NO')}
                        </span>
                    </span>
                ))}
            </div>
        </div>
    );
}
