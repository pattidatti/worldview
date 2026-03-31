import { useEffect } from 'react';
import { LAYER_DEFAULTS } from '@/types/layers';

interface KeyboardHelpModalProps {
    onClose: () => void;
}

const LAYER_SHORTCUTS = LAYER_DEFAULTS.slice(0, 6).map((l, i) => ({
    key: String(i + 1),
    label: `Toggle ${l.name}`,
}));

const SHORTCUTS = [
    { key: '?', label: 'Vis/skjul denne hjelpen' },
    { key: 'Escape', label: 'Lukk popup / avbryt søk' },
    { key: 'Ctrl+K  /  /', label: 'Fokuser søkefelt' },
    ...LAYER_SHORTCUTS,
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
                <p className="mt-4 text-[10px] text-[var(--text-muted)] text-center">
                    Trykk ? eller Escape for å lukke
                </p>
            </div>
        </div>
    );
}
