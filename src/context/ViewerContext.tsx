import { createContext, useContext } from 'react';
import { Viewer } from 'cesium';

const ViewerContext = createContext<Viewer | null>(null);

export const ViewerProvider = ViewerContext.Provider;

export function useViewer(): Viewer | null {
    return useContext(ViewerContext);
}
