export interface RainViewerFrame {
    time: number;
    path: string;
}

export interface RainViewerMaps {
    version: string;
    generated: number;
    host: string;
    radar: {
        past: RainViewerFrame[];
        nowcast: RainViewerFrame[];
    };
}
