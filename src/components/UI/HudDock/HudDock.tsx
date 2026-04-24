import { useState, useEffect, useRef } from 'react';
import { ResetCameraButton } from '../ResetCameraButton';
import { OrbitButton } from '../OrbitButton';
import { CameraHud } from '../CameraHud';
import { DimensionToggle } from '../DimensionToggle';
import { ImageryPicker } from '../ImageryPicker';
import { ShaderOverlayPicker } from '../ShaderOverlayPicker';
import { MissionControl } from '../MissionControl';

type DrawerId = 'camera' | 'scene' | 'effects' | null;

interface DockIconProps {
    icon: string;
    label: string;
    active: boolean;
    onClick: () => void;
    title: string;
}

function DockIcon({ icon, label, active, onClick, title }: DockIconProps) {
    return (
        <button
            onClick={onClick}
            title={title}
            className={`flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-2 cursor-pointer transition-all duration-150 backdrop-blur-md border
                ${active
                    ? 'bg-white/15 border-white/30 text-white'
                    : 'bg-black/50 border-white/10 text-white/60 hover:bg-white/10 hover:text-white/90'}`}
            style={{ fontFamily: 'var(--font-mono)' }}
        >
            <span style={{ fontSize: '16px', lineHeight: 1 }}>{icon}</span>
            <span className="text-[8px] tracking-widest uppercase">{label}</span>
        </button>
    );
}

interface DrawerProps {
    open: boolean;
    title: string;
    children: React.ReactNode;
}

function Drawer({ open, title, children }: DrawerProps) {
    return (
        <div
            className="pointer-events-auto flex flex-col items-end gap-2"
            style={{
                transition: 'opacity 150ms ease-out, transform 150ms ease-out',
                opacity: open ? 1 : 0,
                transform: open ? 'translateX(0)' : 'translateX(8px)',
                pointerEvents: open ? 'auto' : 'none',
                visibility: open ? 'visible' : 'hidden',
            }}
            aria-hidden={!open}
        >
            <div
                className="font-mono text-[9px] tracking-widest uppercase px-2 py-1 rounded backdrop-blur-md"
                style={{
                    color: 'rgba(0, 212, 255, 0.7)',
                    background: 'rgba(10, 10, 20, 0.5)',
                    border: '1px solid rgba(255,255,255,0.08)',
                }}
            >
                {title}
            </div>
            {children}
        </div>
    );
}

export function HudDock() {
    const [openDrawer, setOpenDrawer] = useState<DrawerId>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Lukk drawer på Escape eller klikk utenfor
    useEffect(() => {
        if (!openDrawer) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpenDrawer(null);
        };
        const onDown = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpenDrawer(null);
            }
        };
        window.addEventListener('keydown', onKey);
        window.addEventListener('mousedown', onDown);
        return () => {
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('mousedown', onDown);
        };
    }, [openDrawer]);

    const toggle = (id: Exclude<DrawerId, null>) =>
        setOpenDrawer((cur) => (cur === id ? null : id));

    return (
        <div
            ref={containerRef}
            className="absolute bottom-20 right-6 z-10 flex items-end gap-3 pointer-events-none"
        >
            {/* Drawer-område — én drawer om gangen, alltid i DOM for smooth transition */}
            <div className="flex flex-col items-end gap-2">
                {openDrawer === 'camera' && (
                    <Drawer open title="Kamera">
                        <CameraHud />
                        <ResetCameraButton />
                        <OrbitButton />
                    </Drawer>
                )}
                {openDrawer === 'scene' && (
                    <Drawer open title="Scene">
                        <DimensionToggle />
                        <ImageryPicker />
                    </Drawer>
                )}
                {openDrawer === 'effects' && (
                    <Drawer open title="Effekter">
                        <ShaderOverlayPicker />
                    </Drawer>
                )}
            </div>

            {/* Dock — alltid synlige ikon-knapper */}
            <div className="pointer-events-auto flex flex-col items-center gap-2">
                <div className="pointer-events-auto">
                    <MissionControl />
                </div>
                <DockIcon
                    icon="🎥"
                    label="Kam"
                    active={openDrawer === 'camera'}
                    onClick={() => toggle('camera')}
                    title="Kamera — nullstill, orbit, posisjon"
                />
                <DockIcon
                    icon="🗺"
                    label="Scene"
                    active={openDrawer === 'scene'}
                    onClick={() => toggle('scene')}
                    title="Scene — 2D/3D, satellittbilder"
                />
                <DockIcon
                    icon="✨"
                    label="FX"
                    active={openDrawer === 'effects'}
                    onClick={() => toggle('effects')}
                    title="Visuelle effekter"
                />
            </div>
        </div>
    );
}
