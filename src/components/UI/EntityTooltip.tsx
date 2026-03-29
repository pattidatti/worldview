import { type HoverState } from '@/hooks/useHoverTooltip';

interface EntityTooltipProps {
    hover: HoverState;
}

export function EntityTooltip({ hover }: EntityTooltipProps) {
    const { content, x, y } = hover;

    // Clamp to viewport so tooltip doesn't go off-screen
    const tooltipWidth = 200;
    const tooltipHeight = 56;
    const offsetX = 14;
    const offsetY = -40;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = x + offsetX;
    let top = y + offsetY;

    if (left + tooltipWidth > vw - 8) left = x - tooltipWidth - offsetX;
    if (top < 8) top = y + 14;
    if (top + tooltipHeight > vh - 8) top = vh - tooltipHeight - 8;

    return (
        <div
            className="fixed z-30 pointer-events-none animate-[fade-in_150ms_ease-out]"
            style={{ left, top }}
        >
            <div
                className="bg-[#12121aee] backdrop-blur-md border border-white/10 rounded-lg px-3 py-2 max-w-[200px]"
                style={{ borderLeftWidth: 3, borderLeftColor: content.color || '#fff' }}
            >
                <div className="flex items-center gap-1.5">
                    {content.icon && <span className="text-sm">{content.icon}</span>}
                    <span className="text-white text-xs font-medium truncate">{content.title}</span>
                </div>
                {content.subtitle && (
                    <div className="text-white/50 text-[10px] mt-0.5 truncate">{content.subtitle}</div>
                )}
            </div>
        </div>
    );
}
