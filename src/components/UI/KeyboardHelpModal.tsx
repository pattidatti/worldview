import { useEffect } from 'react';
import { LAYER_DEFAULTS } from '@/types/layers';

interface KeyboardHelpModalProps {
    onClose: () => void;
}

const LAYER_SHORTCUTS = LAYER_DEFAULTS.slice(0, 6).map((l, i) => ({
    key: String(i + 1),
    label: `Veksle ${l.name}`,
}));

const SHORTCUTS = [
    { key: '?', label: 'Vis/skjul denne hjelpen' },
    { key: 'Escape', label: 'Lukk popup / avbryt søk' },
    { key: 'Ctrl+K  /  /', label: 'Fokuser søkefelt' },
    ...LAYER_SHORTCUTS,
];

const GATE_SHORTCUTS = [
    { key: 'G', label: 'Start tegning av port (når Porter-lag er på)' },
    { key: 'Klikk', label: 'Legg til punkt' },
    { key: 'Dbl-klikk / Enter', label: 'Fullfør port' },
    { key: 'Backspace', label: 'Fjern siste punkt' },
    { key: 'Escape', label: 'Avbryt tegning' },
];

const TIMELINE_SHORTCUTS = [
    { key: 'L', label: 'Veksle LIVE / REPLAY' },
    { key: 'Space', label: 'Pause / spill av (replay)' },
    { key: '← / →', label: 'Hopp ±1 bucket' },
    { key: 'Home', label: 'Hopp til nå (live)' },
    { key: 'End', label: 'Hopp til eldste tilgjengelige' },
];

export function KeyboardHelpModal({ onClose }: KeyboardHelpModalProps) {
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape' || e.key === '?') {
                e.preventDefault();
                onClose();
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="bg-[var(--bg-ui)] border border-white/10 rounded-xl shadow-2xl p-6 w-80"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-mono text-sm font-bold text-[var(--accent-blue)] tracking-wider">
                        TASTATURSNARVEIER
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                    >
                        ✕
                    </button>
                </div>
                <div className="flex flex-col gap-2">
                    {SHORTCUTS.map(({ key, label }) => (
                        <div key={key} className="flex items-center justify-between gap-4">
                            <span className="font-mono text-xs bg-white/5 border border-white/10 rounded px-2 py-0.5 text-[var(--accent-blue)] shrink-0">
                                {key}
                            </span>
                            <span className="text-xs text-[var(--text-secondary)] text-right">
                                {label}
                            </span>
                        </div>
                    ))}
                </div>
                <div className="mt-4 pt-3 border-t border-white/10">
                    <h3 className="font-mono text-[10px] font-bold text-[var(--color-gates)] tracking-wider mb-2">
                        PORTER
                    </h3>
                    <div className="flex flex-col gap-2">
                        {GATE_SHORTCUTS.map(({ key, label }) => (
                            <div key={key} className="flex items-center justify-between gap-4">
                                <span className="font-mono text-xs bg-white/5 border border-white/10 rounded px-2 py-0.5 text-[var(--color-gates)] shrink-0">
                                    {key}
                                </span>
                                <span className="text-xs text-[var(--text-secondary)] text-right">
                                    {label}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="mt-4 pt-3 border-t border-white/10">
                    <h3 className="font-mono text-[10px] font-bold text-[var(--accent-orange)] tracking-wider mb-2">
                        TIDSLINJE
                    </h3>
                    <div className="flex flex-col gap-2">
                        {TIMELINE_SHORTCUTS.map(({ key, label }) => (
                            <div key={key} className="flex items-center justify-between gap-4">
                                <span className="font-mono text-xs bg-white/5 border border-white/10 rounded px-2 py-0.5 text-[var(--accent-orange)] shrink-0">
                                    {key}
                                </span>
                                <span className="text-xs text-[var(--text-secondary)] text-right">
                                    {label}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
                <p className="mt-4 text-[10px] text-[var(--text-muted)] text-center">
                    Trykk ? eller Escape for å lukke
                </p>
            </div>
        </div>
    );
}
