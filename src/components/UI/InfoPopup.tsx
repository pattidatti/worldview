import { type PopupContent } from '@/types/popup';

interface InfoPopupProps {
    content: PopupContent;
    onClose: () => void;
}

export function InfoPopup({ content, onClose }: InfoPopupProps) {
    return (
        <div className="absolute top-6 right-6 z-20 w-80">
            <div
                className="bg-[var(--bg-ui)] backdrop-blur-md border rounded-xl overflow-hidden shadow-2xl"
                style={{ borderColor: content.color ?? 'var(--accent-blue)', borderWidth: '1px' }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                    <div className="flex items-center gap-2 min-w-0">
                        {content.icon && <span className="text-lg shrink-0">{content.icon}</span>}
                        <h3
                            className="font-mono text-sm font-semibold truncate"
                            style={{ color: content.color ?? 'var(--accent-blue)' }}
                        >
                            {content.title}
                        </h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors ml-2 shrink-0 cursor-pointer"
                    >
                        ✕
                    </button>
                </div>

                {/* Fields */}
                <div className="px-4 py-3 flex flex-col gap-2">
                    {content.fields.map((field) => (
                        <div key={field.label} className="flex justify-between items-baseline">
                            <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">
                                {field.label}
                            </span>
                            <span className="font-mono text-sm text-[var(--text-primary)]">
                                {field.value}
                                {field.unit && (
                                    <span className="text-[var(--text-muted)] ml-1 text-xs">
                                        {field.unit}
                                    </span>
                                )}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
