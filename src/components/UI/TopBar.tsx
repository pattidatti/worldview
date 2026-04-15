import { useEffect, useState } from 'react';
import { useLayers } from '@/context/LayerContext';
import { SearchBar, type SearchBarHandle } from './SearchBar';
import { AnimatedCount } from './AnimatedCount';

function SystemClock() {
    const [time, setTime] = useState(() => new Date().toTimeString().slice(0, 8));
    useEffect(() => {
        const id = setInterval(() => setTime(new Date().toTimeString().slice(0, 8)), 1000);
        return () => clearInterval(id);
    }, []);
    return (
        <span className="font-mono text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
            {time}
        </span>
    );
}

interface TopBarProps {
    searchRef?: React.RefObject<SearchBarHandle | null>;
}

export function TopBar({ searchRef }: TopBarProps) {
    const { layers } = useLayers();

    const activeLayers = layers.filter((l) => l.visible);
    const totalObjects = activeLayers.reduce((sum, l) => sum + l.count, 0);

    return (
        <div className="absolute top-0 left-0 right-0 z-10">
            <div className="flex items-center justify-between px-5 py-3 bg-[var(--bg-ui)] backdrop-blur-md border-b border-white/10">
                {/* Logo */}
                <div className="flex items-center gap-3">
                    <h1 className="font-mono text-base font-bold tracking-wider text-[var(--accent-blue)]">
                        WORLDVIEW
                    </h1>
                </div>

                {/* Search */}
                <SearchBar ref={searchRef} />

                {/* Status */}
                <div className="hidden md:flex items-center gap-4 font-mono text-xs text-[var(--text-muted)]">
                    <span>
                        <AnimatedCount
                            value={totalObjects}
                            color="var(--accent-green)"
                            className="text-[var(--accent-green)]"
                        />
                        {' '}objekter
                    </span>
                    <span>
                        <span className="text-[var(--accent-blue)]">{activeLayers.length}</span>
                        /{layers.length} lag
                    </span>
                    <SystemClock />
                </div>
            </div>
        </div>
    );
}
