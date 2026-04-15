import { useEffect, useMemo, useState } from 'react';
import type { LatLon } from '@/types/gate';
import {
    autoSplitSegments,
    crossesAntimeridian,
    isNearPole,
    measureSegments,
    MAX_SEGMENT_KM,
} from '@/utils/geofence';

interface GateNameModalProps {
    vertices: LatLon[];
    onSave: (name: string, vertices: LatLon[]) => void;
    onCancel: () => void;
}

export function GateNameModal({ vertices, onSave, onCancel }: GateNameModalProps) {
    const [name, setName] = useState('');
    const [workingVertices, setWorkingVertices] = useState<LatLon[]>(vertices);

    useEffect(() => setWorkingVertices(vertices), [vertices]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onCancel]);

    const diagnostics = useMemo(() => {
        const tooFew = workingVertices.length < 2;
        const nearPole = isNearPole(workingVertices);
        const antimeridian = crossesAntimeridian(workingVertices);
        const segments = measureSegments(workingVertices);
        const tooLong = segments.filter((s) => s.tooLong);
        const totalKm = segments.reduce((sum, s) => sum + s.km, 0);
        return { tooFew, nearPole, antimeridian, segments, tooLong, totalKm };
    }, [workingVertices]);

    const fatal = diagnostics.tooFew || diagnostics.nearPole || diagnostics.antimeridian;
    const warnings = diagnostics.tooLong.length > 0;
    const canSubmit = !fatal && name.trim().length > 0 && !warnings;

    function handleAutoSplit() {
        setWorkingVertices(autoSplitSegments(workingVertices));
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!canSubmit) return;
        onSave(name.trim(), workingVertices);
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={onCancel}
        >
            <form
                onSubmit={handleSubmit}
                className="bg-[var(--bg-ui)] border border-white/10 rounded-xl shadow-2xl p-6 w-96"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-mono text-sm font-bold text-[var(--color-gates)] tracking-wider">
                        NY PORT
                    </h2>
                    <button
                        type="button"
                        onClick={onCancel}
                        className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                    >
                        ✕
                    </button>
                </div>

                {diagnostics.tooFew && (
                    <div className="mb-3 p-2 rounded bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                        Port må ha minst 2 punkter. Avbryt og start på nytt.
                    </div>
                )}

                {diagnostics.nearPole && (
                    <div className="mb-3 p-2 rounded bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                        Porter støttes ikke nær polene (punkt over 80° breddegrad).
                    </div>
                )}

                {diagnostics.antimeridian && (
                    <div className="mb-3 p-2 rounded bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                        Porter kan ikke krysse datolinjen (±180° lengdegrad).
                    </div>
                )}

                {warnings && !fatal && (
                    <div className="mb-3 p-2 rounded bg-orange-500/10 border border-orange-500/30 text-xs text-orange-200 space-y-1">
                        {diagnostics.tooLong.map((s) => (
                            <div key={s.index}>
                                Segment {s.index + 1} er {Math.round(s.km)} km (grense {MAX_SEGMENT_KM} km).
                            </div>
                        ))}
                        <button
                            type="button"
                            onClick={handleAutoSplit}
                            className="mt-1 font-mono text-[10px] tracking-wider px-2 py-0.5 rounded border border-orange-400/40 text-orange-200 hover:bg-orange-500/20 cursor-pointer"
                        >
                            AUTO-SPLITT I SUB-{MAX_SEGMENT_KM}KM-SEGMENTER
                        </button>
                    </div>
                )}

                <label className="block mb-3">
                    <span className="block font-mono text-[10px] tracking-wider text-[var(--text-muted)] mb-1">
                        NAVN
                    </span>
                    <input
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="f.eks. OSL innflyvning"
                        className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--color-gates)]/60"
                        disabled={fatal}
                    />
                </label>

                <div className="mb-4 grid grid-cols-3 gap-2 font-mono text-[10px]">
                    <div>
                        <div className="text-[var(--text-muted)]">PUNKTER</div>
                        <div className="text-[var(--text-primary)]">{workingVertices.length}</div>
                    </div>
                    <div>
                        <div className="text-[var(--text-muted)]">SEGMENTER</div>
                        <div className="text-[var(--text-primary)]">{diagnostics.segments.length}</div>
                    </div>
                    <div>
                        <div className="text-[var(--text-muted)]">LENGDE</div>
                        <div className="text-[var(--text-primary)]">
                            {formatKm(diagnostics.totalKm)}
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-3 py-1.5 rounded text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5 cursor-pointer"
                    >
                        Avbryt
                    </button>
                    <button
                        type="submit"
                        disabled={!canSubmit}
                        className={`px-3 py-1.5 rounded text-xs font-mono tracking-wider border transition-colors
                            ${canSubmit
                                ? 'border-[var(--color-gates)] text-[var(--color-gates)] hover:bg-[var(--color-gates)]/10 cursor-pointer'
                                : 'border-white/10 text-[var(--text-muted)] cursor-not-allowed opacity-50'}`}
                    >
                        LAGRE PORT
                    </button>
                </div>
            </form>
        </div>
    );
}

function formatKm(km: number): string {
    if (km < 1) return `${Math.round(km * 1000)} m`;
    if (km < 10) return `${km.toFixed(1)} km`;
    return `${Math.round(km)} km`;
}

