import { useTimelineMode, REPLAY_DEFAULT_OFFSET_MS } from '@/context/TimelineModeContext';

export function ModePill() {
    const { mode, setMode, setCursor, jumpToNow } = useTimelineMode();
    const live = mode === 'live';

    const setLive = () => {
        if (!live) jumpToNow();
    };
    const setReplay = () => {
        if (live) {
            setCursor(Date.now() - REPLAY_DEFAULT_OFFSET_MS);
            setMode('replay');
        }
    };

    const liveColor = 'var(--accent-green)';
    const replayColor = 'var(--accent-orange)';

    return (
        <div
            role="tablist"
            aria-label="Tidslinje-modus (L)"
            title="Bytt mellom live og replay (L)"
            className="flex items-stretch rounded-md overflow-hidden select-none"
            style={{
                border: `1px solid ${live ? liveColor + '55' : replayColor + '55'}`,
                background: 'rgba(0,0,0,0.25)',
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                letterSpacing: '0.08em',
                fontWeight: 600,
            }}
        >
            <button
                role="tab"
                aria-selected={live}
                onClick={setLive}
                className="flex items-center gap-1.5 px-2.5 py-1 cursor-pointer transition-colors"
                style={{
                    background: live ? `${liveColor}22` : 'transparent',
                    color: live ? liveColor : 'rgba(255,255,255,0.4)',
                }}
            >
                <span
                    className={live ? 'animate-pulse' : ''}
                    style={{
                        display: 'inline-block',
                        width: 6,
                        height: 6,
                        borderRadius: 999,
                        background: live ? liveColor : 'rgba(255,255,255,0.2)',
                    }}
                />
                LIVE
            </button>
            <button
                role="tab"
                aria-selected={!live}
                onClick={setReplay}
                className="flex items-center gap-1.5 px-2.5 py-1 cursor-pointer transition-colors border-l"
                style={{
                    background: !live ? `${replayColor}22` : 'transparent',
                    color: !live ? replayColor : 'rgba(255,255,255,0.4)',
                    borderLeftColor: 'rgba(255,255,255,0.08)',
                }}
            >
                <span style={{ fontSize: '9px' }}>▶</span>
                REPLAY
            </button>
        </div>
    );
}
