import { createContext, useContext, useState, type ReactNode } from 'react';
import { type ShaderOverlayMode } from '@/types/shaderOverlay';

interface ShaderOverlayContextValue {
    activeOverlay: ShaderOverlayMode;
    setOverlay: (mode: ShaderOverlayMode) => void;
}

const ShaderOverlayContext = createContext<ShaderOverlayContextValue>({
    activeOverlay: 'none',
    setOverlay: () => {},
});

export function ShaderOverlayProvider({ children }: { children: ReactNode }) {
    const [activeOverlay, setOverlay] = useState<ShaderOverlayMode>('none');
    return (
        <ShaderOverlayContext.Provider value={{ activeOverlay, setOverlay }}>
            {children}
        </ShaderOverlayContext.Provider>
    );
}

export function useShaderOverlay(): ShaderOverlayContextValue {
    return useContext(ShaderOverlayContext);
}
