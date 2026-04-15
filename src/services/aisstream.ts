import { type Ship } from '@/types/ship';
import { type Viewport } from '@/hooks/useViewport';

type ShipCallback = (ships: Map<number, Ship>) => void;

const SUBSCRIPTION_BUFFER = 1.5; // grader padding på hver kant av kamera-viewporten

function expandViewport(vp: Viewport): Viewport {
    return {
        west:  Math.max(-180, vp.west  - SUBSCRIPTION_BUFFER),
        east:  Math.min( 180, vp.east  + SUBSCRIPTION_BUFFER),
        south: Math.max( -90, vp.south - SUBSCRIPTION_BUFFER),
        north: Math.min(  90, vp.north + SUBSCRIPTION_BUFFER),
    };
}

export class AISStreamConnection {
    private ws: WebSocket | null = null;
    private ships = new Map<number, Ship>();
    private onUpdate: ShipCallback;
    private onError?: (msg: string) => void;
    private apiKey: string;
    private subscribedViewport: Viewport; // det buffrete området vi faktisk abonnerer på
    private updateTimer: ReturnType<typeof setInterval> | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private connectTimeout: ReturnType<typeof setTimeout> | null = null;
    private stopped = false;
    private reconnectCount = 0;

    constructor(apiKey: string, viewport: Viewport, onUpdate: ShipCallback, onError?: (msg: string) => void) {
        this.apiKey = apiKey;
        this.subscribedViewport = expandViewport(viewport);
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
                if (import.meta.env.DEV) console.warn('[AIS] Connection timeout, retrying...');
                this.ws.close();
            }
        }, 10_000);

        this.ws.onopen = () => {
            if (import.meta.env.DEV) console.log('[AIS] Connected via', wsUrl);
            if (this.connectTimeout) clearTimeout(this.connectTimeout);
            this.reconnectCount = 0;
            this.ws?.send(
                JSON.stringify({
                    APIKey: this.apiKey,
                    BoundingBoxes: [
                        [
                            [this.subscribedViewport.south, this.subscribedViewport.west],
                            [this.subscribedViewport.north, this.subscribedViewport.east],
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
                const meta = msg.MetaData;
                if (!meta) return;
                const mmsi: number = meta.MMSI;

                if (msg.MessageType === 'PositionReport' || msg.MessageType === 'StandardClassBPositionReport') {
                    const pos = msg.Message?.[msg.MessageType];
                    if (!pos) return;

                    const existing = this.ships.get(mmsi);
                    this.ships.set(mmsi, {
                        // Preserve static data if we already have it
                        callSign: existing?.callSign ?? '',
                        imo: existing?.imo ?? 0,
                        shipType: existing?.shipType ?? 0,
                        length: existing?.length ?? 0,
                        width: existing?.width ?? 0,
                        draught: existing?.draught ?? 0,
                        destination: existing?.destination ?? '',
                        // Dynamic data from position report
                        mmsi,
                        name: (meta.ShipName ?? '').trim(),
                        lat: pos.Latitude,
                        lon: pos.Longitude,
                        speed: pos.Sog ?? 0,
                        course: pos.Cog ?? 0,
                        heading: pos.TrueHeading ?? pos.Cog ?? 0,
                        rateOfTurn: pos.RateOfTurn ?? 0,
                        navStatus: pos.NavigationalStatus ?? 15,
                        lastSeen: Date.now(),
                    });
                } else if (msg.MessageType === 'ShipStaticData') {
                    const sd = msg.Message?.ShipStaticData;
                    if (!sd) return;

                    const dim = sd.Dimension;
                    const existing = this.ships.get(mmsi);
                    if (existing) {
                        // Merge static data into existing ship
                        existing.shipType = sd.Type ?? existing.shipType;
                        existing.callSign = (sd.CallSign ?? '').trim();
                        existing.imo = sd.ImoNumber ?? 0;
                        existing.length = dim ? dim.A + dim.B : 0;
                        existing.width = dim ? dim.C + dim.D : 0;
                        existing.draught = sd.MaximumStaticDraught ?? 0;
                        existing.destination = (sd.Destination ?? '').trim();
                    } else {
                        // Cache static data for when position report arrives
                        this.ships.set(mmsi, {
                            mmsi,
                            name: (sd.Name ?? meta.ShipName ?? '').trim(),
                            callSign: (sd.CallSign ?? '').trim(),
                            imo: sd.ImoNumber ?? 0,
                            lat: meta.Latitude ?? 0,
                            lon: meta.Longitude ?? 0,
                            speed: 0, course: 0, heading: 0,
                            rateOfTurn: 0, navStatus: 15,
                            shipType: sd.Type ?? 0,
                            length: dim ? dim.A + dim.B : 0,
                            width: dim ? dim.C + dim.D : 0,
                            draught: sd.MaximumStaticDraught ?? 0,
                            destination: (sd.Destination ?? '').trim(),
                            lastSeen: Date.now(),
                        });
                    }
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
                this.reconnectCount++;
                if (this.reconnectCount >= 3) {
                    this.onError?.('AISStream utilgjengelig – sjekk API-nøkkel eller nettverkstilgang');
                }
                this.reconnectTimer = setTimeout(() => this.connect(), 3000);
            }
        };
    }

    updateViewport(viewport: Viewport) {
        const s = this.subscribedViewport;
        const outside =
            viewport.west  < s.west  ||
            viewport.east  > s.east  ||
            viewport.south < s.south ||
            viewport.north > s.north;
        if (!outside) return; // kameraet er fortsatt innenfor det buffrete abonnements-området

        this.subscribedViewport = expandViewport(viewport);
        // Reconnect UTEN ships.clear() — skip forblir synlige under reconnect
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
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
