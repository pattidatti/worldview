import { useState, useEffect, useRef, type ReactNode } from 'react';
import { ResetCameraButton } from '../ResetCameraButton';
import { OrbitButton } from '../OrbitButton';
import { CameraHud } from '../CameraHud';
import { DimensionToggle } from '../DimensionToggle';
import { ImageryPicker } from '../ImageryPicker';
import { ShaderOverlayPicker } from '../ShaderOverlayPicker';
import { MissionControl } from '../MissionControl';

type DrawerId = 'camera' | 'scene' | 'effects' | null;

const CameraIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="5" width="14" height="9" rx="2"/>
        <circle cx="8" cy="9.5" r="2.5"/>
        <path d="M5 5V4a1 1 0 011-1h4a1 1 0 011 1v1"/>
    </svg>
);

const MapIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="1,3 6,1 10,3 15,1 15,13 10,15 6,13 1,15"/>
        <line x1="6" y1="1" x2="6" y2="13"/>
        <line x1="10" y1="3" x2="10" y2="15"/>
    </svg>
);

const SparkleIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 1v3M8 12v3M1 8h3M12 8h3"/>
        <path d="M3.5 3.5l2 2M10.5 10.5l2 2M3.5 12.5l2-2M10.5 5.5l2-2"/>
        <circle cx="8" cy="8" r="2"/>
    </svg>
);

interface DockIconProps {
    icon: ReactNode;
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
            className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2.5 cursor-pointer transition-all duration-150 backdrop-blur-xl border
                ${active
                    ? 'bg-white/15 border-white/25 text-white'
                    : 'bg-black/55 border-white/[0.08] text-white/50 hover:bg-white/10 hover:text-white/80 hover:border-white/15'}`}
            style={{
                boxShadow: active ? 'var(--glow-blue)' : 'none',
                fontFamily: 'var(--font-mono)',
            }}
        >
            {icon}
            <span className="text-[9px] tracking-widest uppercase leading-none">{label}</span>
        </button>
    );
}

interface DrawerProps {
    open: boolean;
    title: string;
    children: ReactNode;
}

function Drawer({ open, title, children }: DrawerProps) {
    return (
        <div
            className="pointer-events-auto"
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
                className="bg-[var(--bg-ui)] backdrop-blur-xl border border-white/[0.07] rounded-2xl p-3 flex flex-col gap-2.5 min-w-[180px]"
                style={{ boxShadow: 'var(--shadow-panel)' }}
            >
                <p className="font-mono text-[9px] tracking-widest uppercase pb-1 border-b border-white/[0.06]"
                    style={{ color: 'rgba(0, 212, 255, 0.6)' }}>
                    {title}
                </p>
                {children}
            </div>
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
                    icon={<CameraIcon />}
                    label="Kam"
                    active={openDrawer === 'camera'}
                    onClick={() => toggle('camera')}
                    title="Kamera — nullstill, orbit, posisjon"
                />
                <DockIcon
                    icon={<MapIcon />}
                    label="Scene"
                    active={openDrawer === 'scene'}
                    onClick={() => toggle('scene')}
                    title="Scene — 2D/3D, satellittbilder"
                />
                <DockIcon
                    icon={<SparkleIcon />}
                    label="FX"
                    active={openDrawer === 'effects'}
                    onClick={() => toggle('effects')}
                    title="Visuelle effekter"
                />
            </div>
        </div>
    );
}
