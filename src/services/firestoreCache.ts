import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db, auth, isKillSwitchActive } from './firestore';
import type { OverpassElement } from './overpass';
import type { InfrastructureData } from '@/types/infrastructure';

const SCHEMA_VERSION = 1;
const OSM_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SODIR_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Firestore max document size is 1MB; leave margin for metadata fields
const MAX_DOC_BYTES = 900_000;

function canRead(): boolean {
    return !!db && !!auth?.currentUser;
}

function canWrite(): boolean {
    return !!db && !!auth?.currentUser && !isKillSwitchActive();
}

// ── OSM tile cache ───────────────────────────────────────────────────────────
// Stores raw OverpassElement[] (arrays of maps — safe for Firestore).
// Cache key mirrors the existing localStorage key (e.g. "power:60,4,61,5").

export async function getOsmTile(
    cacheKey: string,
    maxAgeMs: number,
): Promise<OverpassElement[] | null> {
    if (!canRead()) return null;
    try {
        const snap = await getDoc(doc(db!, 'static_cache', `osm:${cacheKey}`));
        if (!snap.exists()) return null;
        const d = snap.data() as { fetchedAt: number; schemaVersion: number; items: OverpassElement[] };
        if (d.schemaVersion !== SCHEMA_VERSION) return null;
        if (Date.now() - d.fetchedAt > maxAgeMs) return null;
        return d.items;
    } catch {
        return null;
    }
}

export function setOsmTile(cacheKey: string, items: OverpassElement[]): void {
    if (!canWrite()) return;
    const now = Date.now();
    const payload = {
        fetchedAt: now,
        expiresAt: Timestamp.fromMillis(now + OSM_TTL_MS),
        schemaVersion: SCHEMA_VERSION,
        items,
    };
    if (JSON.stringify(payload).length > MAX_DOC_BYTES) return;
    setDoc(doc(db!, 'static_cache', `osm:${cacheKey}`), payload).catch(() => {});
}

// ── Generic JSON cache (for types with nested arrays unsafe for Firestore) ───

export async function getJsonCache<T>(docId: string, maxAgeMs: number): Promise<T | null> {
    if (!canRead()) return null;
    try {
        const snap = await getDoc(doc(db!, 'static_cache', docId));
        if (!snap.exists()) return null;
        const d = snap.data() as { fetchedAt: number; schemaVersion: number; itemsJson: string };
        if (d.schemaVersion !== SCHEMA_VERSION) return null;
        if (Date.now() - d.fetchedAt > maxAgeMs) return null;
        return JSON.parse(d.itemsJson) as T;
    } catch {
        return null;
    }
}

export function setJsonCache<T>(docId: string, ttlMs: number, data: T): void {
    if (!canWrite()) return;
    const now = Date.now();
    const itemsJson = JSON.stringify(data);
    if (itemsJson.length > MAX_DOC_BYTES) return;
    setDoc(doc(db!, 'static_cache', docId), {
        fetchedAt: now,
        expiresAt: Timestamp.fromMillis(now + ttlMs),
        schemaVersion: SCHEMA_VERSION,
        itemsJson,
    }).catch(() => {});
}

// ── cachedFetch: L1 in-memory + L2 delt Firestore-cache ──────────────────────
// For trege, globalt-identiske endepunkter (samme svar for alle brukere innen
// TTL). Mønster fra nasa-neo.ts, generalisert. Alle innloggede brukere deler
// ÉN fetch per TTL-vindu; gjeste-/utlogget-modus faller pent tilbake til nett
// (getJsonCache/setJsonCache er no-ops uten db+auth).

interface MemEntry { data: unknown; expires: number }
const _memCache = new Map<string, MemEntry>();

export async function cachedFetch<T>(
    docId: string,
    ttlMs: number,
    fetchFn: () => Promise<T>,
): Promise<T> {
    const now = Date.now();

    // L1: in-memory (per økt)
    const mem = _memCache.get(docId);
    if (mem && mem.expires > now) return mem.data as T;

    // L2: delt Firestore-cache
    const fs = await getJsonCache<T>(docId, ttlMs);
    if (fs !== null) {
        _memCache.set(docId, { data: fs, expires: now + ttlMs });
        return fs;
    }

    // L3: nett
    const data = await fetchFn();
    _memCache.set(docId, { data, expires: now + ttlMs });
    setJsonCache(docId, ttlMs, data);
    return data;
}

// ── SODIR cache ──────────────────────────────────────────────────────────────
// InfrastructureData contains number[][][] (nested arrays) which Firestore
// doesn't support directly, so we store as a JSON string field.

export async function getSodirCache(): Promise<InfrastructureData | null> {
    if (!canRead()) return null;
    try {
        const snap = await getDoc(doc(db!, 'static_cache', 'sodir:full'));
        if (!snap.exists()) return null;
        const d = snap.data() as { fetchedAt: number; schemaVersion: number; itemsJson: string };
        if (d.schemaVersion !== SCHEMA_VERSION) return null;
        if (Date.now() - d.fetchedAt > SODIR_TTL_MS) return null;
        const items = JSON.parse(d.itemsJson) as InfrastructureData;
        if (!items.facilities?.length && !items.pipelines?.length && !items.fields?.length) return null;
        return items;
    } catch {
        return null;
    }
}

export function setSodirCache(data: InfrastructureData): void {
    if (!canWrite()) return;
    const now = Date.now();
    const itemsJson = JSON.stringify(data);
    if (itemsJson.length > MAX_DOC_BYTES) return;
    const payload = {
        fetchedAt: now,
        expiresAt: Timestamp.fromMillis(now + SODIR_TTL_MS),
        schemaVersion: SCHEMA_VERSION,
        itemsJson,
    };
    setDoc(doc(db!, 'static_cache', 'sodir:full'), payload).catch(() => {});
}
