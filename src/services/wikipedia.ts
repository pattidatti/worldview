export interface WikiSummary {
    title: string;
    extract: string;
    thumbnailUrl?: string;
    pageUrl: string;
}

export async function fetchWikiSummary(title: string): Promise<WikiSummary | null> {
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
        if (!enRes.ok) return null;
        const en = await enRes.json();
        return {
            title: en.title,
            extract: en.extract ?? '',
            thumbnailUrl: en.thumbnail?.source,
            pageUrl: en.content_urls?.desktop?.page ?? '',
        };
    }

    const data = await res.json();
    return {
        title: data.title,
        extract: data.extract ?? '',
        thumbnailUrl: data.thumbnail?.source,
        pageUrl: data.content_urls?.desktop?.page ?? '',
    };
}
