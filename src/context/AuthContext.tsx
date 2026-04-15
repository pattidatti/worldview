import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithPopup,
    signInWithRedirect,
    signOut as firebaseSignOut,
    getRedirectResult,
    type User,
} from 'firebase/auth';
import { auth, checkKillSwitch, isFirebaseConfigured } from '@/services/firestore';
import { addToast } from '@/components/UI/Toast';

interface AuthContextValue {
    user: User | null;
    loading: boolean;
    error: string | null;
    signIn: () => Promise<void>;
    signOut: () => Promise<void>;
    configured: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function mapAuthError(e: unknown): string {
    const code = (e as { code?: string })?.code ?? '';
    switch (code) {
        case 'auth/popup-closed-by-user':
        case 'auth/cancelled-popup-request':
            return 'Innlogging avbrutt';
        case 'auth/popup-blocked':
            return 'Popup blokkert — prøver redirect';
        case 'auth/network-request-failed':
            return 'Nettverksfeil — sjekk tilkoblingen';
        case 'auth/operation-not-allowed':
            return 'Google-innlogging er ikke aktivert i Firebase';
        default:
            return (e as Error)?.message ?? 'Ukjent auth-feil';
    }
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const configured = isFirebaseConfigured();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState<boolean>(configured);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!auth) {
            setLoading(false);
            return;
        }
        getRedirectResult(auth).catch((e) => {
            console.warn('[auth] getRedirectResult', e);
        });
        const unsub = onAuthStateChanged(auth, (u) => {
            setUser(u);
            setLoading(false);
            if (u) {
                checkKillSwitch().then((disabled) => {
                    if (disabled) {
                        addToast('Read-only modus — writes er deaktivert av admin', 'error');
                    }
                });
            }
        });
        return unsub;
    }, []);

    const signIn = async () => {
        if (!auth) {
            setError('Firebase er ikke konfigurert');
            return;
        }
        setError(null);
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
        } catch (e) {
            const code = (e as { code?: string })?.code ?? '';
            if (code === 'auth/popup-blocked' || code === 'auth/cancelled-popup-request') {
                try {
                    await signInWithRedirect(auth, provider);
                } catch (re) {
                    setError(mapAuthError(re));
                }
                return;
            }
            setError(mapAuthError(e));
        }
    };

    const signOut = async () => {
        if (!auth) return;
        await firebaseSignOut(auth);
    };

    const value = useMemo<AuthContextValue>(
        () => ({ user, loading, error, signIn, signOut, configured }),
        [user, loading, error, configured]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth må brukes inni AuthProvider');
    return ctx;
}
