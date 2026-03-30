import { useEffect, useState } from 'react';
import { Math as CesiumMath } from 'cesium';
import { useViewer } from '@/context/ViewerContext';

interface CameraPos {
    lat: number;
    lon: number;
    altKm: number;
    heading: number;
}

function headingLabel(deg: number): string {
    const dirs = ['N', 'NNØ', 'NØ', 'ØNØ', 'Ø', 'ØSØ', 'SØ', 'SSØ', 'S', 'SSV', 'SV', 'VSV', 'V', 'VNV', 'NV', 'NNV'];
    return dirs[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
}

function fmt(n: number, decimals: number): string {
    return n.toFixed(decimals);
}

export function CameraHud() {
    const viewer = useViewer();
    const [pos, setPos] = useState<CameraPos | null>(null);

    useEffect(() => {
        if (!viewer) return;
        const id = setInterval(() => {
            if (viewer.isDestroyed()) return;
            const carto = viewer.camera.positionCartographic;
            setPos({
                lat: CesiumMath.toDegrees(carto.latitude),
                lon: CesiumMath.toDegrees(carto.longitude),
                altKm: carto.height / 1000,
                heading: CesiumMath.toDegrees(viewer.camera.heading),
            });
        }, 800);
        return () => clearInterval(id);
    }, [viewer]);

    if (!pos) return null;

    const altDisplay = pos.altKm >= 1000
        ? `${fmt(pos.altKm / 1000, 1)} Mm`
        : pos.altKm >= 1
        ? `${fmt(pos.altKm, 1)} km`
        : `${Math.round(pos.altKm * 1000)} m`;

    const row = (label: string, value: string) => (
        <div className="flex justify-between gap-3">
            <span style={{ color: 'var(--text-muted)' }}>{label}</span>
            <span style={{ color: 'rgba(255,255,255,0.6)' }}>{value}</span>
        </div>
    );

    return (
        <div
            className="absolute z-10 pointer-events-none"
            style={{
                bottom: '6rem',
                right: '1.5rem',
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                lineHeight: '1.6',
                letterSpacing: '0.04em',
                background: 'rgba(10, 10, 20, 0.65)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderLeft: '2px solid rgba(0, 212, 255, 0.4)',
                borderRadius: '6px',
                padding: '6px 10px',
                minWidth: '130px',
            }}
        >
            <div className="font-bold tracking-widest mb-1" style={{ color: 'rgba(0, 212, 255, 0.6)', fontSize: '9px' }}>
                KAMERA
            </div>
            {row('LAT', `${fmt(pos.lat, 3)}°`)}
            {row('LON', `${fmt(pos.lon, 3)}°`)}
            {row('ALT', altDisplay)}
            {row('HDG', `${headingLabel(pos.heading)} ${Math.round(pos.heading)}°`)}
        </div>
    );
}
