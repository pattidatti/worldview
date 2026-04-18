import { createContext, useContext, useState, type ReactNode } from 'react';

interface SceneProjectionContextValue {
    is2D: boolean;
    setIs2D: (v: boolean) => void;
}

const SceneProjectionContext = createContext<SceneProjectionContextValue>({
    is2D: false,
    setIs2D: () => {},
});

export function SceneProjectionProvider({ children }: { children: ReactNode }) {
    const [is2D, setIs2D] = useState(false);
    return (
        <SceneProjectionContext.Provider value={{ is2D, setIs2D }}>
            {children}
        </SceneProjectionContext.Provider>
    );
}

export function useSceneProjection() {
    return useContext(SceneProjectionContext);
}
