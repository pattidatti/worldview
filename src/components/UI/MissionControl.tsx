import { useState, useRef, useCallback, useEffect } from 'react';
import { Math as CesiumMath } from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useGeointRegistry } from '@/context/GeointContext';
import { useViewport } from '@/hooks/useViewport';
import { streamGeointBrief } from '@/services/geoint';

export function MissionControl() {
    const viewer = useViewer();
    const { collect } = useGeointRegistry();
    const viewport = useViewport(viewer);
    const [open, setOpen] = useState(false);
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [timestamp, setTimestamp] = useState('');
    const abortRef = useRef<AbortController | null>(null);
    const bodyRef = useRef<HTMLDivElement | null>(null);

    // Auto-scroll to bottom as text streams in
    useEffect(() => {
        if (bodyRef.current) {
            bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
        }
    }, [text]);

    const handleClose = useCallback(() => {
        abortRef.current?.abort();
        setOpen(false);
    }, []);

    const handleOpen = useCallback(async () => {
        if (!viewer) return;
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setText('');
        setError(null);
        setLoading(true);
        setTimestamp(new Date().toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        setOpen(true);

        try {
            const carto = viewer.camera.positionCartographic;
            const centerLat = CesiumMath.toDegrees(carto.latitude);
            const centerLon = CesiumMath.toDegrees(carto.longitude);
            const cameraAlt = carto.height;
            const vp = viewport ?? {
                west: centerLon - 15,
                east: centerLon + 15,
                south: centerLat - 10,
                north: centerLat + 10,
            };

            const layerData = collect();
            const stream = await streamGeointBrief(vp, cameraAlt, centerLat, centerLon, layerData, controller.signal);
            const reader = stream.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                setText((prev) => prev + value);
            }
        } catch (err) {
            if (!(err instanceof DOMException && err.name === 'AbortError')) {
                setError(err instanceof Error ? err.message : 'Ukjent feil');
            }
        } finally {
            // Only clear loading if this is still the active request (guards against rapid re-clicks)
            if (abortRef.current === controller) setLoading(false);
        }
    }, [viewer, viewport, collect]);

    // ESC to close
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [open, handleClose]);

    const buttonStyle: React.CSSProperties = {
        fontFamily: 'var(--font-mono)',
        background: open ? 'rgba(0, 255, 136, 0.12)' : 'rgba(10, 10, 20, 0.65)',
        backdropFilter: 'blur(8px)',
        border: open ? '1px solid rgba(0, 255, 136, 0.5)' : '1px solid rgba(255,255,255,0.08)',
        borderLeft: open ? '2px solid rgba(0, 255, 136, 0.8)' : '2px solid rgba(255,255,255,0.12)',
        borderRadius: '6px',
        padding: '8px 12px',
        minWidth: '130px',
        cursor: loading ? 'wait' : 'pointer',
        transition: 'all 0.2s',
        textAlign: 'left' as const,
    };

    return (
        <>
            {/* Trigger button */}
                <button onClick={handleOpen} style={buttonStyle} title="AI GEOINT-brief for gjeldende visning">
                    <div style={{ fontSize: '9px', letterSpacing: '0.08em', marginBottom: '6px', color: 'rgba(0, 255, 136, 0.7)', fontWeight: 'bold' }}>
                        MISSION CONTROL
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '18px', lineHeight: 1 }}>⚡</span>
                        <div>
                            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', letterSpacing: '0.04em', lineHeight: 1.4 }}>
                                BRIEFING
                            </div>
                            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.04em' }}>
                                AI-analyse
                            </div>
                        </div>
                        {loading && (
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(0,255,136,0.9)', marginLeft: 'auto', animation: 'pulse 1s infinite' }} />
                        )}
                    </div>
                </button>

            {/* Modal overlay */}
            {open && (
                <>
                    <div
                        onClick={handleClose}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(0, 0, 0, 0.5)',
                            zIndex: 40,
                        }}
                    />
                    <div
                        style={{
                            position: 'fixed',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            zIndex: 50,
                            width: 'min(520px, 90vw)',
                            maxHeight: '70vh',
                            display: 'flex',
                            flexDirection: 'column',
                            fontFamily: 'var(--font-mono)',
                            background: 'rgba(6, 8, 18, 0.95)',
                            backdropFilter: 'blur(16px)',
                            border: '1px solid rgba(0, 255, 136, 0.2)',
                            borderTop: '2px solid rgba(0, 255, 136, 0.6)',
                            borderRadius: '8px',
                            boxShadow: '0 0 40px rgba(0, 255, 136, 0.08), 0 20px 60px rgba(0,0,0,0.6)',
                        }}
                    >
                        {/* Header */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px 16px',
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                            flexShrink: 0,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '16px' }}>🛰</span>
                                <div>
                                    <div style={{ fontSize: '11px', fontWeight: 'bold', letterSpacing: '0.1em', color: 'rgba(0, 255, 136, 0.9)' }}>
                                        GEOINT BRIEF
                                    </div>
                                    <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em' }}>
                                        {timestamp}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={handleClose}
                                style={{
                                    background: 'none',
                                    border: '1px solid rgba(255,255,255,0.12)',
                                    borderRadius: '4px',
                                    color: 'rgba(255,255,255,0.4)',
                                    cursor: 'pointer',
                                    padding: '4px 8px',
                                    fontSize: '11px',
                                    fontFamily: 'var(--font-mono)',
                                    letterSpacing: '0.04em',
                                }}
                            >
                                ✕ LUKK
                            </button>
                        </div>

                        {/* Body */}
                        <div
                            ref={bodyRef}
                            style={{
                                flex: 1,
                                overflowY: 'auto',
                                padding: '16px',
                                minHeight: '120px',
                            }}
                        >
                            {loading && !text && (
                                <div style={{ color: 'rgba(0, 255, 136, 0.6)', fontSize: '12px', letterSpacing: '0.06em', animation: 'pulse 1.5s infinite' }}>
                                    Analyserer sanntidsdata...
                                </div>
                            )}
                            {error && (
                                <div style={{ color: '#ff4444', fontSize: '12px', lineHeight: 1.6 }}>
                                    ⚠ {error}
                                </div>
                            )}
                            {text && (
                                <div style={{
                                    fontSize: '12px',
                                    lineHeight: '1.7',
                                    color: 'rgba(255,255,255,0.82)',
                                    whiteSpace: 'pre-wrap',
                                    letterSpacing: '0.02em',
                                }}>
                                    {text}
                                    {loading && <span style={{ color: 'rgba(0,255,136,0.7)', animation: 'pulse 0.8s infinite' }}>▌</span>}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div style={{
                            padding: '8px 16px',
                            borderTop: '1px solid rgba(255,255,255,0.06)',
                            flexShrink: 0,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}>
                            <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.06em' }}>
                                GENERERT AV GEMINI · SANNTIDSDATA WORLDVIEW
                            </span>
                            {!loading && text && (
                                <button
                                    onClick={handleOpen}
                                    style={{
                                        background: 'none',
                                        border: '1px solid rgba(0,255,136,0.2)',
                                        borderRadius: '4px',
                                        color: 'rgba(0,255,136,0.6)',
                                        cursor: 'pointer',
                                        padding: '3px 8px',
                                        fontSize: '9px',
                                        fontFamily: 'var(--font-mono)',
                                        letterSpacing: '0.06em',
                                    }}
                                >
                                    ↻ OPPDATER
                                </button>
                            )}
                        </div>
                    </div>
                </>
            )}
        </>
    );
}
