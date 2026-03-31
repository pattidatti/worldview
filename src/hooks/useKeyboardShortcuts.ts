import { useEffect } from 'react';
import { type LayerId } from '@/types/layers';

interface KeyboardShortcutOptions {
    toggleLayer: (id: LayerId) => void;
    closePopup: () => void;
    focusSearch: () => void;
    toggleHelp: () => void;
    layerIds: LayerId[];
}

export function useKeyboardShortcuts({
    toggleLayer,
    closePopup,
    focusSearch,
    toggleHelp,
    layerIds,
}: KeyboardShortcutOptions) {
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const active = document.activeElement;
            const isTyping =
                active instanceof HTMLInputElement ||
                active instanceof HTMLTextAreaElement ||
                (active instanceof HTMLElement && active.isContentEditable);

            // Escape always works
            if (e.key === 'Escape') {
                closePopup();
                if (active instanceof HTMLInputElement) active.blur();
                return;
            }

            // Ctrl+K / Cmd+K to focus search
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                focusSearch();
                return;
            }

            // Skip remaining shortcuts when typing
            if (isTyping) return;

            // / to focus search
            if (e.key === '/') {
                e.preventDefault();
                focusSearch();
                return;
            }

            // ? to toggle keyboard help
            if (e.key === '?') {
                e.preventDefault();
                toggleHelp();
                return;
            }

            // 1-6 to toggle layers
            const num = parseInt(e.key, 10);
            if (num >= 1 && num <= layerIds.length) {
                toggleLayer(layerIds[num - 1]);
            }
        };

        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [toggleLayer, closePopup, focusSearch, toggleHelp, layerIds]);
}
