import { useLayers } from '@/context/LayerContext';
import { SearchBar, type SearchBarHandle } from './SearchBar';

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
                    <div className="hidden sm:flex items-center gap-1.5">
                        {layers.map((l) => (
                            <span
                                key={l.id}
                                className="w-1.5 h-1.5 rounded-full transition-opacity"
                                style={{
                                    backgroundColor: l.color,
                                    opacity: l.visible ? 1 : 0.2,
                                }}
                                title={`${l.name}: ${l.visible ? l.count : 'av'}`}
                            />
                        ))}
                    </div>
                </div>

                {/* Search */}
                <SearchBar ref={searchRef} />

                {/* Status */}
                <div className="hidden md:flex items-center gap-4 font-mono text-xs text-[var(--text-muted)]">
                    <span>
                        <span className="text-[var(--accent-green)]">{totalObjects.toLocaleString('nb-NO')}</span>
                        {' '}objekter
                    </span>
                    <span>
                        <span className="text-[var(--accent-blue)]">{activeLayers.length}</span>
                        /{layers.length} lag
                    </span>
                </div>
            </div>
        </div>
    );
}
