import { useAuth } from '@/context/AuthContext';

export function SignInGate() {
    const { user, loading, error, signIn, configured } = useAuth();

    if (loading) return null;
    if (user) return null;

    return (
        <div
            className="fixed inset-0 flex items-center justify-center"
            style={{
                zIndex: 60,
                background: 'radial-gradient(ellipse at center, rgba(6,8,18,0.88) 0%, rgba(0,0,0,0.96) 100%)',
                backdropFilter: 'blur(20px)',
            }}
        >
            <div
                className="flex flex-col items-center gap-6 px-10 py-10 rounded"
                style={{
                    background: 'rgba(6,8,18,0.95)',
                    border: '1px solid rgba(0,255,136,0.2)',
                    borderTop: '2px solid rgba(0,255,136,0.5)',
                    minWidth: 360,
                    maxWidth: 440,
                }}
            >
                <h1
                    className="font-mono text-xl font-bold tracking-widest"
                    style={{ color: 'var(--accent-blue)' }}
                >
                    WORLDVIEW
                </h1>
                <p
                    className="font-mono text-xs uppercase tracking-wider text-center"
                    style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}
                >
                    Logg inn for å få tilgang
                </p>

                {!configured ? (
                    <div
                        className="font-mono text-xs px-4 py-3 rounded"
                        style={{
                            color: 'var(--accent-red, #ff6666)',
                            background: 'rgba(255,100,100,0.08)',
                            border: '1px solid rgba(255,100,100,0.25)',
                        }}
                    >
                        Firebase-config mangler. Sjekk <code>.env</code> (VITE_FIREBASE_*).
                    </div>
                ) : (
                    <>
                        <button
                            onClick={signIn}
                            className="w-full px-4 py-2 font-mono text-sm tracking-wider cursor-pointer transition-colors"
                            style={{
                                background: 'rgba(10,10,20,0.65)',
                                border: '1px solid rgba(255,255,255,0.12)',
                                borderLeft: '2px solid var(--accent-green)',
                                color: 'var(--text-primary, #fff)',
                                letterSpacing: '0.08em',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,255,136,0.08)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(10,10,20,0.65)')}
                        >
                            LOGG INN MED GOOGLE
                        </button>
                        {error && (
                            <p
                                className="font-mono text-xs text-center"
                                style={{ color: 'var(--accent-red, #ff6666)' }}
                            >
                                {error}
                            </p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
