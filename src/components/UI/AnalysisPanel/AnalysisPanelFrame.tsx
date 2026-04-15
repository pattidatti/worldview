import { type ReactNode } from 'react';
import { useDrag, type DragPosition } from '@/hooks/useDrag';

interface AnalysisPanelFrameProps {
    title: string;
    subtitle?: string;
    initialPosition: DragPosition;
    onPositionChange: (pos: DragPosition) => void;
    onClose: () => void;
    width?: number;
    height?: number;
    children: ReactNode;
}

export function AnalysisPanelFrame({
    title,
    subtitle,
    initialPosition,
    onPositionChange,
    onClose,
    width = 280,
    height,
    children,
}: AnalysisPanelFrameProps) {
    const { position, bind } = useDrag({
        initial: initialPosition,
        onEnd: onPositionChange,
        panelWidth: width,
        panelHeight: height ?? 120,
    });

    return (
        <div
            className="fixed"
            style={{
                left: position.x,
                top: position.y,
                width,
                height,
                background: 'rgba(6,8,18,0.95)',
                border: '1px solid rgba(0,255,136,0.2)',
                borderTop: '2px solid rgba(0,255,136,0.5)',
                backdropFilter: 'blur(16px)',
                color: 'var(--text-primary, #fff)',
                fontFamily: 'var(--font-mono)',
                zIndex: 25,
                userSelect: 'none',
                borderRadius: 2,
            }}
        >
            <div
                {...bind}
                className="flex items-center justify-between px-3 py-2 cursor-move"
                style={{
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    touchAction: 'none',
                }}
            >
                <div className="flex flex-col">
                    <span
                        className="text-xs tracking-wider"
                        style={{ color: 'var(--accent-blue)', letterSpacing: '0.12em' }}
                    >
                        {title.toUpperCase()}
                    </span>
                    {subtitle && (
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            {subtitle}
                        </span>
                    )}
                </div>
                <button
                    onClick={onClose}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="cursor-pointer text-xs w-5 h-5 flex items-center justify-center"
                    style={{ color: 'var(--text-muted)' }}
                    title="Lukk"
                >
                    ×
                </button>
            </div>
            <div className="px-3 py-3">{children}</div>
        </div>
    );
}
