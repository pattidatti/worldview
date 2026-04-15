import { useTimelineMode, type TimelineSpeed } from '@/context/TimelineModeContext';

const SPEEDS: Array<{ value: TimelineSpeed; label: string }> = [
    { value: 0, label: '⏸' },
    { value: 30, label: '30m/s' },
    { value: 120, label: '2t/s' },
    { value: 360, label: '6t/s' },
];

export function PlaybackControls() {
    const { mode, speed, setSpeed, jumpToNow } = useTimelineMode();
    const disabled = mode === 'live';

    return (
        <div className="flex items-center gap-1">
            {SPEEDS.map((s) => {
                const active = !disabled && speed === s.value;
                return (
                    <button
                        key={s.value}
                        disabled={disabled}
                        onClick={() => setSpeed(s.value)}
                        className="px-2 py-1 rounded-md font-mono text-[10px]
                                   transition-colors select-none
                                   disabled:opacity-30 disabled:cursor-not-allowed"
                        style={{
                            background: active ? 'var(--accent-orange)22' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${active ? 'var(--accent-orange)66' : 'rgba(255,255,255,0.08)'}`,
                            color: active ? 'var(--accent-orange)' : 'var(--text-secondary)',
                            minWidth: 40,
                            textAlign: 'center',
                        }}
                        title={s.value === 0 ? 'Pause' : `${s.value} sekunder per sekund`}
                    >
                        {s.label}
                    </button>
                );
            })}
            <button
                disabled={disabled}
                onClick={jumpToNow}
                className="px-2.5 py-1 rounded-md font-mono text-[10px]
                           bg-white/5 hover:bg-white/10 border border-white/10
                           text-[var(--text-secondary)] transition-colors
                           disabled:opacity-30 disabled:cursor-not-allowed"
                title="Hopp til nå (Home)"
            >
                NÅ →
            </button>
        </div>
    );
}
