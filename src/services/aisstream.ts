import { type Ship } from '@/types/ship';
import { type Viewport } from '@/hooks/useViewport';

type ShipCallback = (ships: Map<number, Ship>) => void;

export class AISStreamConnection {
    private ws: WebSocket | null = null;
    private ships = new Map<number, Ship>();
    private onUpdate: ShipCallback;
    private apiKey: string;
    private viewport: Viewport;
    private updateTimer: ReturnType<typeof setInterval> | null = null;

    constructor(apiKey: string, viewport: Viewport, onUpdate: ShipCallback) {
        this.apiKey = apiKey;
        this.viewport = viewport;
        this.onUpdate = onUpdate;
    }

    connect() {
        if (this.ws) this.disconnect();

        this.ws = new WebSocket('wss://stream.aisstream.io/v0/stream');

        this.ws.onopen = () => {
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
                        lat: pos.Latitude,
                        lon: pos.Longitude,
                        speed: pos.Sog ?? 0,
                        course: pos.Cog ?? 0,
                        heading: pos.TrueHeading ?? pos.Cog ?? 0,
                        shipType: meta.ShipType ?? 0,
                        destination: (pos.Destination ?? '').trim(),
                    });
                }
            } catch {
                // Skip malformed messages
            }
        };

        this.ws.onerror = () => {
            // Will reconnect via onclose
        };

        this.ws.onclose = () => {
            this.ws = null;
        };

        // Batch updates every 5 seconds
        this.updateTimer = setInterval(() => {
            this.onUpdate(new Map(this.ships));
        }, 5000);
    }

    updateViewport(viewport: Viewport) {
        this.viewport = viewport;
        // Reconnect with new bounding box
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.disconnect();
            this.ships.clear();
            this.connect();
        }
    }

    disconnect() {
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
