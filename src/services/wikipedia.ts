export interface WikiSummary {
    title: string;
    extract: string;
    thumbnailUrl?: string;
    pageUrl: string;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 time
const SS_PREFIX = 'wiki:';

interface WikiCache {
    data: WikiSummary | null;
    cachedAt: number;
}

const memCache = new Map<string, WikiSummary | null>();

function loadFromSession(key: string): WikiSummary | null | undefined {
    try {
        const raw = sessionStorage.getItem(SS_PREFIX + key);
        if (!raw) return undefined;
        const entry: WikiCache = JSON.parse(raw);
        if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
            sessionStorage.removeItem(SS_PREFIX + key);
            return undefined;
        }
        return entry.data;
    } catch {
        return undefined;
    }
}

function saveToSession(key: string, data: WikiSummary | null): void {
    try {
        sessionStorage.setItem(SS_PREFIX + key, JSON.stringify({ data, cachedAt: Date.now() }));
    } catch { /* quota exceeded — ignore */ }
}

export async function fetchWikiSummary(title: string): Promise<WikiSummary | null> {
    const key = title.toLowerCase();

    if (memCache.has(key)) return memCache.get(key) ?? null;
    const ss = loadFromSession(key);
    if (ss !== undefined) {
        memCache.set(key, ss);
        return ss;
    }

    const encoded = encodeURIComponent(title);
    const res = await fetch(
        `https://nb.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
        { headers: { 'User-Agent': 'WorldView/0.1' } },
    );

    if (!res.ok) {
        // Fall back to English Wikipedia
        const enRes = await fetch(
            `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
            { headers: { 'User-Agent': 'WorldView/0.1' } },
        );
        if (!enRes.ok) {
            memCache.set(key, null);
            saveToSession(key, null);
            return null;
        }
        const en = await enRes.json();
        const result: WikiSummary = {
            title: en.title,
            extract: en.extract ?? '',
            thumbnailUrl: en.thumbnail?.source,
            pageUrl: en.content_urls?.desktop?.page ?? '',
        };
        memCache.set(key, result);
        saveToSession(key, result);
        return result;
    }

    const data = await res.json();
    const result: WikiSummary = {
        title: data.title,
        extract: data.extract ?? '',
        thumbnailUrl: data.thumbnail?.source,
        pageUrl: data.content_urls?.desktop?.page ?? '',
    };
    memCache.set(key, result);
    saveToSession(key, result);
    return result;
}
