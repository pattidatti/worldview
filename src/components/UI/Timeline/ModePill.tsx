import { useTimelineMode, REPLAY_DEFAULT_OFFSET_MS } from '@/context/TimelineModeContext';

export function ModePill() {
    const { mode, setMode, setCursor, jumpToNow } = useTimelineMode();
    const live = mode === 'live';

    const handleClick = () => {
        if (live) {
            setCursor(Date.now() - REPLAY_DEFAULT_OFFSET_MS);
            setMode('replay');
        } else {
            jumpToNow();
        }
    };

    const color = live ? 'var(--accent-green)' : 'var(--accent-orange)';
    const label = live ? 'LIVE' : 'REPLAY';

    return (
        <button
            onClick={handleClick}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md
                       font-mono text-[10px] font-semibold tracking-widest
                       transition-colors select-none"
            style={{
                background: `${color}15`,
                border: `1px solid ${color}55`,
                color,
            }}
            title={live ? 'Klikk for å starte replay' : 'Klikk for å hoppe til nå'}
        >
            <span
                className={live ? 'animate-pulse' : ''}
                style={{
                    display: 'inline-block',
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: color,
                }}
            />
            {label}
        </button>
    );
}
