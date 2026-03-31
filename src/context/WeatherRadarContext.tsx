import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import { type RainViewerFrame } from '@/types/weatherRadar';

const ANIM_INTERVAL = 500; // ms per frame

interface WeatherRadarContextValue {
    // Frames (settes av WeatherRadarLayer når data ankommer)
    allFrames: RainViewerFrame[];
    pastCount: number;
    setFrameData: (frames: RainViewerFrame[], pastCount: number) => void;

    // Avspillingstilstand
    currentIndex: number;
    setCurrentIndex: React.Dispatch<React.SetStateAction<number>>;
    isAnimating: boolean;

    // Handlinger
    toggleAnimation: () => void;
    stopAnimation: () => void;
}

const WeatherRadarContext = createContext<WeatherRadarContextValue | null>(null);

export function WeatherRadarProvider({ children }: { children: ReactNode }) {
    const [allFrames, setAllFrames] = useState<RainViewerFrame[]>([]);
    const [pastCount, setPastCount] = useState(0);
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [isAnimating, setIsAnimating] = useState(false);
    const animRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // Ref for å unngå stale closure i interval-callback
    const allFramesRef = useRef(allFrames);
    allFramesRef.current = allFrames;

    const setFrameData = useCallback((frames: RainViewerFrame[], past: number) => {
        setAllFrames(frames);
        setPastCount(past);
    }, []);

    const stopAnimation = useCallback(() => {
        if (animRef.current) {
            clearInterval(animRef.current);
            animRef.current = null;
        }
        setIsAnimating(false);
    }, []);

    const toggleAnimation = useCallback(() => {
        if (isAnimating) {
            stopAnimation();
        } else {
            if (animRef.current) clearInterval(animRef.current);
            animRef.current = setInterval(() => {
                setCurrentIndex((prev) =>
                    prev >= allFramesRef.current.length - 1 ? 0 : prev + 1
                );
            }, ANIM_INTERVAL);
            setIsAnimating(true);
        }
    }, [isAnimating, stopAnimation]);

    return (
        <WeatherRadarContext.Provider value={{
            allFrames, pastCount, setFrameData,
            currentIndex, setCurrentIndex,
            isAnimating, toggleAnimation, stopAnimation,
        }}>
            {children}
        </WeatherRadarContext.Provider>
    );
}

export function useWeatherRadar(): WeatherRadarContextValue {
    const ctx = useContext(WeatherRadarContext);
    if (!ctx) throw new Error('useWeatherRadar must be used within WeatherRadarProvider');
    return ctx;
}
