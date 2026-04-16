import { Math as CesiumMath } from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useOrbit } from '@/context/OrbitContext';

export function ResetCameraButton() {
    const viewer = useViewer();
    const { orbitActive, setOrbitActive } = useOrbit();

    const handleReset = () => {
        if (!viewer || viewer.isDestroyed()) return;

        if (orbitActive) setOrbitActive(false);

        const carto = viewer.camera.positionCartographic;
        viewer.camera.flyTo({
            destination: viewer.scene.globe.ellipsoid.cartographicToCartesian(carto),
            orientation: {
                heading: 0,
                pitch: CesiumMath.toRadians(-90),
                roll: 0,
            },
            duration: 1.0,
        });
    };

    return (
        <div>
            <button
                onClick={handleReset}
                title="Nullstill kamera — nord opp, ingen tilt"
                style={{
                    fontFamily: 'var(--font-mono)',
                    background: 'rgba(10, 10, 20, 0.65)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderLeft: '2px solid rgba(255,255,255,0.12)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    minWidth: '130px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                }}
            >
                <div style={{ fontSize: '9px', letterSpacing: '0.08em', marginBottom: '6px', color: 'rgba(255,255,255,0.5)', fontWeight: 'bold' }}>
                    NULLSTILL
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="9" />
                        <polygon points="12,4 10,9 14,9" fill="rgba(255,255,255,0.5)" stroke="none" />
                        <polygon points="12,20 10,15 14,15" fill="none" stroke="rgba(255,255,255,0.3)" />
                        <line x1="12" y1="4" x2="12" y2="20" strokeOpacity="0.2" />
                    </svg>
                    <div>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', letterSpacing: '0.04em', lineHeight: 1.4 }}>
                            KAMERA
                        </div>
                        <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.04em' }}>
                            Nord opp
                        </div>
                    </div>
                </div>
            </button>
        </div>
    );
}
