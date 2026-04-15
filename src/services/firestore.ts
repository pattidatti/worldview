import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { doc, getDoc, getFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
    appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

export function isFirebaseConfigured(): boolean {
    return !!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.authDomain && firebaseConfig.appId);
}

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

if (isFirebaseConfigured()) {
    app = initializeApp({
        apiKey: firebaseConfig.apiKey!,
        authDomain: firebaseConfig.authDomain!,
        projectId: firebaseConfig.projectId!,
        appId: firebaseConfig.appId!,
    });
    authInstance = getAuth(app);
    dbInstance = getFirestore(app);
} else {
    console.warn('[firestore] Firebase config mangler — kjører i offline-only modus. Se .env.example.');
}

export const auth = authInstance;
export const db = dbInstance;
export { app };

// Kill-switch: når /config/killSwitch.disabled == true, blokkerer klient writes og viser toast.
let killSwitchActive = false;

export function isKillSwitchActive(): boolean {
    return killSwitchActive;
}

export async function checkKillSwitch(): Promise<boolean> {
    if (!db) return false;
    try {
        const snap = await getDoc(doc(db, 'config', 'killSwitch'));
        if (snap.exists() && (snap.data() as { disabled?: boolean }).disabled === true) {
            killSwitchActive = true;
            return true;
        }
    } catch (e) {
        console.warn('[firestore] kill-switch sjekk feilet', e);
    }
    killSwitchActive = false;
    return false;
}
