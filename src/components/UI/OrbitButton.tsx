import { useOrbit } from '@/context/OrbitContext';

function speedLabel(speed: number): string {
    if (speed <= 0.002) return 'Sakte';
    if (speed <= 0.005) return 'Middels';
    return 'Rask';
}

export function OrbitButton() {
    const { orbitActive, setOrbitActive, orbitSpeed, setOrbitSpeed } = useOrbit();

    return (
        <div className="absolute z-10 flex flex-col gap-1" style={{ bottom: '14.5rem', right: '1.5rem' }}>
            <button
                onClick={() => setOrbitActive(!orbitActive)}
                title="Spionfly-orbit — sirkuler rundt nåværende punkt"
                style={{
                    fontFamily: 'var(--font-mono)',
                    background: orbitActive ? 'rgba(0, 212, 255, 0.12)' : 'rgba(10, 10, 20, 0.65)',
                    backdropFilter: 'blur(8px)',
                    border: orbitActive ? '1px solid rgba(0, 212, 255, 0.5)' : '1px solid rgba(255,255,255,0.08)',
                    borderLeft: orbitActive ? '2px solid rgba(0, 212, 255, 0.8)' : '2px solid rgba(255,255,255,0.12)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    minWidth: '130px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                }}
            >
                <div style={{ fontSize: '9px', letterSpacing: '0.08em', marginBottom: '6px', color: orbitActive ? 'rgba(0, 212, 255, 0.9)' : 'rgba(0, 212, 255, 0.6)', fontWeight: 'bold' }}>
                    ORBIT
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={orbitActive ? 'rgba(0,212,255,0.9)' : 'rgba(255,255,255,0.5)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <ellipse cx="12" cy="12" rx="10" ry="4" />
                        <line x1="12" y1="2" x2="12" y2="22" />
                        <path d="M2 12 Q6 7 12 8 Q18 9 22 12" />
                    </svg>
                    <div>
                        <div style={{ fontSize: '11px', color: orbitActive ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)', letterSpacing: '0.04em', lineHeight: 1.4 }}>
                            {orbitActive ? 'AKTIV' : 'INAKTIV'}
                        </div>
                        <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.04em' }}>
                            Spionfly-modus
                        </div>
                    </div>
                    {orbitActive && (
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(0,212,255,0.9)', marginLeft: 'auto', animation: 'pulse 1.5s infinite' }} />
                    )}
                </div>
            </button>

            {orbitActive && (
                <div
                    style={{
                        fontFamily: 'var(--font-mono)',
                        background: 'rgba(10, 10, 20, 0.75)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid rgba(0, 212, 255, 0.25)',
                        borderLeft: '2px solid rgba(0, 212, 255, 0.5)',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        minWidth: '130px',
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '9px', letterSpacing: '0.08em', color: 'rgba(0, 212, 255, 0.6)', fontWeight: 'bold' }}>
                            HASTIGHET
                        </span>
                        <span style={{ fontSize: '9px', color: 'rgba(0, 212, 255, 0.8)' }}>
                            {speedLabel(orbitSpeed)}
                        </span>
                    </div>
                    <input
                        type="range"
                        min={0.0005}
                        max={0.012}
                        step={0.0005}
                        value={orbitSpeed}
                        onChange={(e) => setOrbitSpeed(parseFloat(e.target.value))}
                        style={{ width: '100%', accentColor: 'rgba(0, 212, 255, 0.8)', cursor: 'pointer' }}
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </div>
    );
}
