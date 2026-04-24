import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';

export function SignOutButton() {
    const { user, signOut, guestMode, exitGuestMode } = useAuth();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        window.addEventListener('mousedown', handler);
        return () => window.removeEventListener('mousedown', handler);
    }, [open]);

    if (!user && !guestMode) return null;

    // Guest-modus: vis en "G" badge og dropdown som lar brukeren logge inn.
    if (!user && guestMode) {
        return (
            <div ref={ref} className="relative">
                <button
                    onClick={() => setOpen((v) => !v)}
                    className="w-7 h-7 rounded-full font-mono text-xs flex items-center justify-center cursor-pointer"
                    style={{
                        background: 'rgba(10,10,20,0.65)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        color: 'var(--text-muted)',
                    }}
                    title="Gjeste-modus — trykk for å logge inn"
                >
                    G
                </button>
                {open && (
                    <div
                        className="absolute right-0 mt-2 rounded font-mono text-xs"
                        style={{
                            background: 'rgba(6,8,18,0.95)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            minWidth: 220,
                            backdropFilter: 'blur(16px)',
                            zIndex: 20,
                        }}
                    >
                        <div
                            className="px-3 py-2"
                            style={{
                                color: 'var(--text-muted)',
                                borderBottom: '1px solid rgba(255,255,255,0.08)',
                            }}
                        >
                            Gjeste-modus
                            <div style={{ fontSize: '10px', opacity: 0.6 }}>
                                Porter og historikk er lokale.
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                setOpen(false);
                                exitGuestMode();
                            }}
                            className="w-full text-left px-3 py-2 cursor-pointer"
                            style={{ color: 'var(--accent-green)', letterSpacing: '0.08em' }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,255,136,0.1)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                            LOGG INN
                        </button>
                    </div>
                )}
            </div>
        );
    }

    // user er ikke-null herfra.
    const u = user!;
    const initial = (u.displayName?.[0] ?? u.email?.[0] ?? '?').toUpperCase();

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen((v) => !v)}
                className="w-7 h-7 rounded-full font-mono text-xs flex items-center justify-center cursor-pointer"
                style={{
                    background: 'rgba(10,10,20,0.65)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: 'var(--accent-blue)',
                    backgroundImage: u.photoURL ? `url(${u.photoURL})` : undefined,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                }}
                title={u.displayName ?? u.email ?? ''}
            >
                {!u.photoURL && initial}
            </button>
            {open && (
                <div
                    className="absolute right-0 mt-2 rounded font-mono text-xs"
                    style={{
                        background: 'rgba(6,8,18,0.95)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        minWidth: 200,
                        backdropFilter: 'blur(16px)',
                        zIndex: 20,
                    }}
                >
                    <div
                        className="px-3 py-2"
                        style={{
                            color: 'var(--text-muted)',
                            borderBottom: '1px solid rgba(255,255,255,0.08)',
                        }}
                    >
                        <div style={{ color: 'var(--text-primary, #fff)' }}>
                            {u.displayName ?? u.email}
                        </div>
                        {u.displayName && u.email && <div>{u.email}</div>}
                    </div>
                    <button
                        onClick={() => {
                            setOpen(false);
                            void signOut();
                        }}
                        className="w-full text-left px-3 py-2 cursor-pointer"
                        style={{ color: 'var(--text-primary, #fff)', letterSpacing: '0.08em' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,100,100,0.1)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                        LOGG UT
                    </button>
                </div>
            )}
        </div>
    );
}
