const DEV_ROUTES: Record<string, string> = {
    'api.gdeltproject.org': '/proxy/gdelt',
    'cwwp2.dot.ca.gov': '/proxy/dot',
    'aviationweather.gov': '/proxy/sigmet',
    'opensky-network.org': '/proxy/opensky',
};

export function proxied(url: string): string {
    if (import.meta.env.DEV) {
        const u = new URL(url);
        const localBase = DEV_ROUTES[u.hostname];
        if (localBase) return localBase + u.pathname + u.search;
    }
    return `https://corsproxy.io/?${encodeURIComponent(url)}`;
}
