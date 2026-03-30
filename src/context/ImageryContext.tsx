import { createContext, useContext, useState, type ReactNode } from 'react';
import { type ImageryMode } from '@/types/imagery';

interface ImageryContextValue {
    activeMode: ImageryMode;
    setMode: (mode: ImageryMode) => void;
}

const ImageryContext = createContext<ImageryContextValue>({
    activeMode: 'photorealistic3d',
    setMode: () => {},
});

export function ImageryProvider({ children }: { children: ReactNode }) {
    const [activeMode, setMode] = useState<ImageryMode>('photorealistic3d');
    return (
        <ImageryContext.Provider value={{ activeMode, setMode }}>
            {children}
        </ImageryContext.Provider>
    );
}

export function useImagery(): ImageryContextValue {
    return useContext(ImageryContext);
}
