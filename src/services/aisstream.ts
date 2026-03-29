import { type Ship } from '@/types/ship';
import { type Viewport } from '@/hooks/useViewport';

type ShipCallback = (ships: Map<number, Ship>) => void;

export class AISStreamConnection {
    private ws: WebSocket | null = null;
    private ships = new Map<number, Ship>();
    private onUpdate: ShipCallback;
    private onError?: (msg: string) => void;
    private apiKey: string;
    private viewport: Viewport;
    private updateTimer: ReturnType<typeof setInterval> | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private connectTimeout: ReturnType<typeof setTimeout> | null = null;
    private stopped = false;

    constructor(apiKey: string, viewport: Viewport, onUpdate: ShipCallback, onError?: (msg: string) => void) {
        this.apiKey = apiKey;
        this.viewport = viewport;
        this.onUpdate = onUpdate;
        this.onError = onError;
    }

    connect() {
        if (this.stopped) return;
        if (this.ws) this.disconnect();

        const wsUrl = import.meta.env.DEV
            ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ais-ws`
            : 'wss://stream.aisstream.io/v0/stream';
        this.ws = new WebSocket(wsUrl);

        // Timeout: if not connected within 10s, close and let onclose retry
        this.connectTimeout = setTimeout(() => {
            if (this.ws?.readyState === WebSocket.CONNECTING) {
                console.warn('[AIS] Connection timeout, retrying...');
                this.ws.close();
            }
        }, 10_000);

        this.ws.onopen = () => {
            if (this.connectTimeout) clearTimeout(this.connectTimeout);
            this.ws?.send(
                JSON.stringify({
                    APIKey: this.apiKey,
                    BoundingBoxes: [
                        [
                            [this.viewport.south, this.viewport.west],
                            [this.viewport.north, this.viewport.east],
                        ],
                    ],
                })
            );

            // Start batch timer AFTER connection is established
            this.updateTimer = setInterval(() => {
                this.onUpdate(new Map(this.ships));
            }, 5000);
        };

        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.MessageType === 'PositionReport') {
                    const pos = msg.Message?.PositionReport;
                    const meta = msg.MetaData;
                    if (!pos || !meta) return;

                    const mmsi = meta.MMSI;
                    this.ships.set(mmsi, {
                        mmsi,
                        name: (meta.ShipName ?? '').trim(),
                        callSign: (meta.CallSign ?? '').trim(),
                        imo: meta.IMO ?? 0,
                        lat: pos.Latitude,
                        lon: pos.Longitude,
                        speed: pos.Sog ?? 0,
                        course: pos.Cog ?? 0,
                        heading: pos.TrueHeading ?? pos.Cog ?? 0,
                        rateOfTurn: pos.RateOfTurn ?? 0,
                        navStatus: pos.NavigationalStatus ?? 15,
                        shipType: meta.ShipType ?? 0,
                        length: meta.Length ?? 0,
                        width: meta.Width ?? 0,
                        draught: meta.Draught ?? 0,
                        destination: (pos.Destination ?? '').trim(),
                    });
                }
            } catch {
                // Skip malformed messages
            }
        };

        this.ws.onerror = () => {
            this.onError?.('WebSocket-feil');
        };

        this.ws.onclose = () => {
            if (this.connectTimeout) clearTimeout(this.connectTimeout);
            if (this.updateTimer) {
                clearInterval(this.updateTimer);
                this.updateTimer = null;
            }
            this.ws = null;

            // Auto-reconnect after 3s unless stopped
            if (!this.stopped) {
                this.reconnectTimer = setTimeout(() => this.connect(), 3000);
            }
        };
    }

    updateViewport(viewport: Viewport) {
        this.viewport = viewport;
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ships.clear();
            // Disconnect and reconnect with new bounding box
            if (this.ws) {
                this.ws.onclose = null;
                this.ws.close();
                this.ws = null;
            }
            if (this.updateTimer) {
                clearInterval(this.updateTimer);
                this.updateTimer = null;
            }
            this.connect();
        }
    }

    disconnect() {
        this.stopped = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.connectTimeout) {
            clearTimeout(this.connectTimeout);
            this.connectTimeout = null;
        }
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
        }
        if (this.ws) {
            this.ws.onclose = null;
            this.ws.close();
            this.ws = null;
        }
    }
}
