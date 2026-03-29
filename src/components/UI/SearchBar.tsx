import { useState, useRef, useEffect, useCallback } from 'react';
import { Rectangle } from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { geocode, type GeoResult } from '@/services/geocoding';

export function SearchBar() {
    const viewer = useViewer();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<GeoResult[]>([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const containerRef = useRef<HTMLDivElement>(null);

    const search = useCallback(async (q: string) => {
        if (q.length < 2) {
            setResults([]);
            return;
        }
        setLoading(true);
        const res = await geocode(q);
        setResults(res);
        setOpen(res.length > 0);
        setLoading(false);
    }, []);

    const handleInput = (value: string) => {
        setQuery(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => search(value), 400);
    };

    const flyTo = (result: GeoResult) => {
        if (!viewer || viewer.isDestroyed()) return;

        const [south, north, west, east] = result.boundingbox;
        const rect = Rectangle.fromDegrees(west, south, east, north);

        viewer.camera.flyTo({
            destination: rect,
            duration: 2,
        });

        setOpen(false);
        setQuery(result.name.split(',')[0]);
    };

    // Close on click outside
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    return (
        <div ref={containerRef} className="relative w-72">
            <div className="flex items-center bg-[var(--bg-ui)] backdrop-blur-md border border-white/10 rounded-lg overflow-hidden">
                <span className="pl-3 text-[var(--text-muted)] text-sm">🔍</span>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => handleInput(e.target.value)}
                    onFocus={() => results.length > 0 && setOpen(true)}
                    placeholder="Søk sted, fly, skip..."
                    className="w-full bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none font-sans"
                />
                {loading && (
                    <span className="pr-3 text-[var(--accent-blue)] text-xs animate-pulse">...</span>
                )}
            </div>

            {open && results.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--bg-ui)] backdrop-blur-md border border-white/10 rounded-lg overflow-hidden shadow-2xl z-50">
                    {results.map((r, i) => (
                        <button
                            key={i}
                            onClick={() => flyTo(r)}
                            className="w-full text-left px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:bg-white/10 transition-colors cursor-pointer border-b border-white/5 last:border-0"
                        >
                            <span className="block truncate">{r.name}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
