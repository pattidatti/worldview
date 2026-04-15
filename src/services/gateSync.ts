import {
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    setDoc,
    updateDoc,
    type Unsubscribe,
} from 'firebase/firestore';
import { db, isKillSwitchActive } from './firestore';
import { GATE_SCHEMA_VERSION, type Gate, type GateRemote } from '@/types/gate';

const COLLECTION = 'gates';

function visibilityKey(uid: string) {
    return `worldview-gates-visibility-${uid}`;
}

export function loadVisibility(uid: string): Record<string, boolean> {
    try {
        const raw = localStorage.getItem(visibilityKey(uid));
        if (!raw) return {};
        return JSON.parse(raw) as Record<string, boolean>;
    } catch {
        return {};
    }
}

export function saveVisibility(uid: string, map: Record<string, boolean>) {
    try {
        localStorage.setItem(visibilityKey(uid), JSON.stringify(map));
    } catch {
        /* ignore quota */
    }
}

export function subscribeGates(
    uid: string,
    onChange: (gates: Gate[]) => void,
): Unsubscribe {
    if (!db) return () => {};
    const col = collection(db, COLLECTION);
    return onSnapshot(col, (snap) => {
        const visibility = loadVisibility(uid);
        const gates: Gate[] = snap.docs.map((d) => {
            const data = d.data() as GateRemote;
            return {
                id: d.id,
                name: data.name,
                vertices: data.vertices,
                color: data.color,
                createdAt: data.createdAt,
                ownerUid: data.ownerUid,
                schemaVersion: data.schemaVersion,
                visible: visibility[d.id] ?? true,
            };
        });
        onChange(gates);
    }, (err) => {
        console.warn('[gateSync] snapshot error', err);
    });
}

export async function writeGate(gate: Gate, ownerUid: string): Promise<void> {
    if (!db) throw new Error('Firestore ikke initialisert');
    if (isKillSwitchActive()) throw new Error('Read-only modus — writes deaktivert');
    const remote: GateRemote = {
        name: gate.name,
        vertices: gate.vertices,
        color: gate.color,
        createdAt: gate.createdAt,
        ownerUid,
        schemaVersion: GATE_SCHEMA_VERSION,
    };
    await setDoc(doc(db, COLLECTION, gate.id), remote);
}

export async function patchGate(
    id: string,
    patch: Partial<Pick<Gate, 'name' | 'vertices' | 'color'>>,
): Promise<void> {
    if (!db) throw new Error('Firestore ikke initialisert');
    if (isKillSwitchActive()) throw new Error('Read-only modus — writes deaktivert');
    await updateDoc(doc(db, COLLECTION, id), patch);
}

export async function deleteGate(id: string): Promise<void> {
    if (!db) throw new Error('Firestore ikke initialisert');
    if (isKillSwitchActive()) throw new Error('Read-only modus — writes deaktivert');
    await deleteDoc(doc(db, COLLECTION, id));
}
