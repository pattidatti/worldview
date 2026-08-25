import { createContext, useContext, useState, useMemo, useCallback, type ReactNode } from 'react';
import { type ImageryMode } from '@/types/imagery';
import { type PhotorealSource } from '@/utils/photorealTileset';

/**
 * Status for Google Photorealistic 3D Tiles. `source` er satt når tilsettet er
 * lastet (hvilken rute som vant), `error` er satt når begge rutene feilet.
 * Begge er null før første forsøk.
 */
export interface PhotorealStatus {
    source: PhotorealSource | null;
    error: string | null;
}

interface ImageryContextValue {
    activeMode: ImageryMode;
    setMode: (mode: ImageryMode) => void;
    photoreal: PhotorealStatus;
    setPhotorealStatus: (status: PhotorealStatus) => void;
}

const ImageryContext = createContext<ImageryContextValue>({
    activeMode: 'photorealistic3d',
    setMode: () => {},
    photoreal: { source: null, error: null },
    setPhotorealStatus: () => {},
});

export function ImageryProvider({ children }: { children: ReactNode }) {
    const [activeMode, setMode] = useState<ImageryMode>('photorealistic3d');
    const [photoreal, setPhotorealStatus] = useState<PhotorealStatus>({ source: null, error: null });

    const stableSetPhotoreal = useCallback((status: PhotorealStatus) => {
        setPhotorealStatus((prev) =>
            prev.source === status.source && prev.error === status.error ? prev : status
        );
    }, []);

    const value = useMemo(
        () => ({ activeMode, setMode, photoreal, setPhotorealStatus: stableSetPhotoreal }),
        [activeMode, photoreal, stableSetPhotoreal]
    );

    return <ImageryContext.Provider value={value}>{children}</ImageryContext.Provider>;
}

export function useImagery(): ImageryContextValue {
    return useContext(ImageryContext);
}
