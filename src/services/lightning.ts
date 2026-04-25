import { type LightningStrike } from '@/types/lightning';

type StrikeCallback = (strike: LightningStrike) => void;
type ErrorCallback = (msg: string) => void;

interface BlitzMsg {
    lat?: number;
    lon?: number;
    time?: number | string;
    pol?: number;
    delay?: number;
}

const WS_URL = import.meta.env.DEV
    ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/lightning-ws`
    : 'wss://ws.blitzortung.org';

export class LightningConnection {
    private ws: WebSocket | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private stopped = false;
    private reconnectCount = 0;
    private onStrike: StrikeCallback;
    private onError?: ErrorCallback;

    constructor(onStrike: StrikeCallback, onError?: ErrorCallback) {
        this.onStrike = onStrike;
        this.onError = onError;
    }

    connect() {
        if (this.stopped) return;
        this.ws = new WebSocket(WS_URL);

        this.ws.onopen = () => {
            this.reconnectCount = 0;
        };

        this.ws.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data as string) as BlitzMsg;
                if (!Number.isFinite(data.lat) || !Number.isFinite(data.lon)) return;
                const ts = typeof data.time === 'number'
                    ? Math.floor(data.time / 1_000_000) // nanoseconds → ms
                    : Date.now();
                this.onStrike({
                    id: `${data.time ?? Date.now()}-${data.lat}-${data.lon}`,
                    lat: data.lat!,
                    lon: data.lon!,
                    ts,
                    polarity: data.pol ?? 0,
                });
            } catch {
                // ignorer ugyldige meldinger
            }
        };

        this.ws.onerror = () => {
            this.onError?.('Kobling til Blitzortung feilet');
        };

        this.ws.onclose = () => {
            if (this.stopped) return;
            const delay = Math.min(30_000, 2_000 * Math.pow(1.5, this.reconnectCount++));
            this.reconnectTimer = setTimeout(() => this.connect(), delay);
        };
    }

    disconnect() {
        this.stopped = true;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.ws?.close();
        this.ws = null;
    }
}
