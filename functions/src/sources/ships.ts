// Fetcher for aisstream.io via WebSocket.
// Åpner i 30s, samler posisjonsrapporter, lukker, returnerer snapshot.
// Bruker Nord-Europa bounding box for MVP (matcher flights-fokuset).

import WebSocket from 'ws';

export interface SnapshotShip {
    mmsi: number;
    name: string;
    callSign: string;
    imo: number;
    lat: number;
    lon: number;
    speed: number;
    course: number;
    heading: number;
    rateOfTurn: number;
    navStatus: number;
    shipType: number;
    length: number;
    width: number;
    draught: number;
    destination: string;
}

// Nord-Europa + Nordatlantiken. Utvides via flere BoundingBoxes ved behov.
const BOUNDING_BOX: [[number, number], [number, number]] = [
    [45, -15], // sør-vest (lat, lon)
    [75, 40],  // nord-øst
];

const SAMPLE_WINDOW_MS = 30_000;

export async function fetchAllShips(apiKey: string): Promise<SnapshotShip[]> {
    return new Promise((resolve) => {
        const ships = new Map<number, SnapshotShip>();
        let settled = false;
        const settle = () => {
            if (settled) return;
            settled = true;
            try { ws.close(); } catch { /* ignore */ }
            resolve(Array.from(ships.values()));
        };

        const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');

        const timeout = setTimeout(settle, SAMPLE_WINDOW_MS);
        const hardTimeout = setTimeout(() => {
            console.warn('[ships] hard-timeout 40s — lukker');
            settle();
        }, 40_000);

        ws.on('open', () => {
            ws.send(JSON.stringify({
                APIKey: apiKey,
                BoundingBoxes: [BOUNDING_BOX],
            }));
        });

        ws.on('message', (raw: WebSocket.RawData) => {
            try {
                const msg = JSON.parse(raw.toString());
                const meta = msg.MetaData;
                if (!meta) return;
                const mmsi: number = meta.MMSI;
                if (!mmsi) return;

                if (msg.MessageType === 'PositionReport' || msg.MessageType === 'StandardClassBPositionReport') {
                    const pos = msg.Message?.[msg.MessageType];
                    if (!pos) return;
                    const existing = ships.get(mmsi);
                    ships.set(mmsi, {
                        callSign: existing?.callSign ?? '',
                        imo: existing?.imo ?? 0,
                        shipType: existing?.shipType ?? 0,
                        length: existing?.length ?? 0,
                        width: existing?.width ?? 0,
                        draught: existing?.draught ?? 0,
                        destination: existing?.destination ?? '',
                        mmsi,
                        name: (meta.ShipName ?? '').trim(),
                        lat: pos.Latitude,
                        lon: pos.Longitude,
                        speed: pos.Sog ?? 0,
                        course: pos.Cog ?? 0,
                        heading: pos.TrueHeading ?? pos.Cog ?? 0,
                        rateOfTurn: pos.RateOfTurn ?? 0,
                        navStatus: pos.NavigationalStatus ?? 15,
                    });
                } else if (msg.MessageType === 'ShipStaticData') {
                    const sd = msg.Message?.ShipStaticData;
                    if (!sd) return;
                    const dim = sd.Dimension;
                    const existing = ships.get(mmsi);
                    if (existing) {
                        existing.shipType = sd.Type ?? existing.shipType;
                        existing.callSign = (sd.CallSign ?? '').trim();
                        existing.imo = sd.ImoNumber ?? 0;
                        existing.length = dim ? dim.A + dim.B : 0;
                        existing.width = dim ? dim.C + dim.D : 0;
                        existing.draught = sd.MaximumStaticDraught ?? 0;
                        existing.destination = (sd.Destination ?? '').trim();
                    }
                }
            } catch (e) {
                console.warn('[ships] parse-feil', e);
            }
        });

        ws.on('error', (e) => {
            console.warn('[ships] ws error', e);
            clearTimeout(timeout);
            clearTimeout(hardTimeout);
            settle();
        });

        ws.on('close', () => {
            clearTimeout(timeout);
            clearTimeout(hardTimeout);
            settle();
        });
    });
}
