import { type Viewport } from '@/hooks/useViewport';
import { type GeointLayerData } from '@/types/geoint';

function buildPrompt(
    centerLat: number,
    centerLon: number,
    altKm: number,
    viewport: Viewport,
    layerData: GeointLayerData[],
): string {
    const latStr = `${Math.abs(centerLat).toFixed(2)}°${centerLat >= 0 ? 'N' : 'S'}`;
    const lonStr = `${Math.abs(centerLon).toFixed(2)}°${centerLon >= 0 ? 'Ø' : 'V'}`;
    const altStr = altKm >= 1000 ? `${(altKm / 1000).toFixed(1)} Mm` : `${altKm.toFixed(0)} km`;

    const layerLines = layerData.length > 0
        ? layerData.map((layer) => {
            const header = `[${layer.label.toUpperCase()}] ${layer.count} enheter`;
            const items = layer.items.length > 0
                ? layer.items.map((item) => `  - ${item}`).join('\n')
                : '  (ingen detaljdata)';
            return `${header}\n${items}`;
        }).join('\n\n')
        : '(ingen aktive datalag)';

    return `Du er en GEOINT-analytiker (geospatial intelligence). Brukeren overvåker en sanntids 3D-globus med åpne datakilder.

KAMERAPOSISJON: ${latStr}, ${lonStr}, høyde ${altStr}
VIEWPORT: ${viewport.west.toFixed(1)}°V til ${viewport.east.toFixed(1)}°Ø, ${viewport.south.toFixed(1)}°S til ${viewport.north.toFixed(1)}°N

AKTIVE DATALAG:
${layerLines}

Gi en kortfattet GEOINT-brief i 4-6 kulepunkter. Fokus på:
- Uvanlige mønstre eller konsentrasjoner av aktivitet
- Militær eller strategisk interesse
- Potensielle risikoer, trusler eller pågående hendelser
- Geografisk kontekst for det aktuelle området
- Forbindelser mellom ulike datalag hvis relevant

Bruk norsk kulepunktformat (•). Vær konkret og analytisk, ikke generell. Maks 300 ord.`;
}

export async function streamGeointBrief(
    viewport: Viewport,
    cameraAlt: number,
    centerLat: number,
    centerLon: number,
    layerData: GeointLayerData[],
    signal: AbortSignal,
): Promise<ReadableStream<string>> {
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('Mangler VITE_ANTHROPIC_API_KEY i miljøvariabler');

    const prompt = buildPrompt(centerLat, centerLon, cameraAlt / 1000, viewport, layerData);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 1024,
            stream: true,
            messages: [{ role: 'user', content: prompt }],
        }),
        signal,
    });

    if (!response.ok) {
        const body = await response.text().catch(() => response.statusText);
        throw new Error(`API-feil ${response.status}: ${body}`);
    }

    if (!response.body) throw new Error('Ingen stream fra API');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    return new ReadableStream<string>({
        async start(controller) {
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value, { stream: true });
                    for (const line of chunk.split('\n')) {
                        if (!line.startsWith('data: ')) continue;
                        const json = line.slice(6).trim();
                        if (json === '[DONE]' || json === '') continue;
                        try {
                            const parsed = JSON.parse(json);
                            // Anthropic SSE format: content_block_delta with delta.text
                            const delta: string = parsed.delta?.text ?? '';
                            if (delta) controller.enqueue(delta);
                        } catch {
                            // skip malformed SSE lines
                        }
                    }
                }
                controller.close();
            } catch (err) {
                controller.error(err);
            }
        },
        cancel() {
            reader.cancel();
        },
    });
}
