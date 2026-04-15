import { useTimelineMode } from '@/context/TimelineModeContext';

function toInputValue(ts: number): string {
    // yyyy-mm-dd for <input type="date"> i lokal tidssone.
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function TimelineDatePicker() {
    const { mode, cursor, setCursor, setMode } = useTimelineMode();

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (!value) return;
        const [y, m, d] = value.split('-').map(Number);
        if (!y || !m || !d) return;
        // Sett cursor til midt på dagen i lokal tid.
        const ts = new Date(y, m - 1, d, 12, 0, 0).getTime();
        if (mode === 'live') setMode('replay');
        setCursor(ts);
    };

    return (
        <input
            type="date"
            value={toInputValue(cursor)}
            onChange={handleChange}
            className="px-2 py-1 rounded-md font-mono text-[10px]
                       bg-white/5 hover:bg-white/10 border border-white/10
                       text-[var(--text-secondary)] transition-colors
                       focus:outline-none focus:border-[var(--accent-orange)]"
            title="Hopp til dato"
        />
    );
}
