import { useEffect, useRef } from 'react';
import {
    CustomDataSource,
    Entity,
    Cartesian3,
    Color,
    ConstantPositionProperty,
    VerticalOrigin,
    HorizontalOrigin,
    HeightReference,
    ConstantProperty,
} from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayerActions, useLayerVisibility } from '@/store/layerStore';
import { useTooltipRegistry } from '@/context/TooltipRegistry';
import { LightningConnection } from '@/services/lightning';
import { type LightningStrike } from '@/types/lightning';

const MAX_STRIKES = 500;
const FADE_MS = 8_000;   // fade-out over 8 sek
const TTL_MS = 30_000;   // fjern etter 30 sek

const POSITIVE_COLOR = '#fff176'; // gul
const NEGATIVE_COLOR = '#82b1ff'; // blålig

function createStrikeIcon(positive: boolean): string {
    const color = positive ? POSITIVE_COLOR : NEGATIVE_COLOR;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12">
        <circle cx="6" cy="6" r="5" fill="${color}" fill-opacity="0.9" stroke="${color}" stroke-width="0.5"/>
    </svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

interface StrikeRecord {
    strike: LightningStrike;
    entity: Entity;
}

export function LightningLayer() {
    const viewer = useViewer();
    const { setLayerLoading, setLayerCount, setLayerError } = useLayerActions();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const visible = useLayerVisibility('lightning');
    const dataSourceRef = useRef<CustomDataSource | null>(null);
    const strikeQueueRef = useRef<StrikeRecord[]>([]);
    const connRef = useRef<LightningConnection | null>(null);
    const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const visibleRef = useRef(visible);
    visibleRef.current = visible;

    useEffect(() => {
        tooltipRegister('lightning', (entity: Entity) => {
            if (!dataSourceRef.current?.entities.contains(entity)) return null;
            const rec = strikeQueueRef.current.find((r) => r.entity === entity);
            if (!rec) return null;
            const pol = rec.strike.polarity >= 0 ? '+' : '−';
            return {
                title: 'Lynnedslag',
                subtitle: `${pol} · ${new Date(rec.strike.ts).toLocaleTimeString('nb-NO')}`,
                icon: '⚡',
                color: POSITIVE_COLOR,
            };
        });
        return () => tooltipUnregister('lightning');
    }, [tooltipRegister, tooltipUnregister]);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        const ds = new CustomDataSource('lightning');
        viewer.dataSources.add(ds);
        dataSourceRef.current = ds;
        return () => {
            if (!viewer.isDestroyed()) viewer.dataSources.remove(ds, true);
            dataSourceRef.current = null;
        };
    }, [viewer]);

    useEffect(() => {
        if (dataSourceRef.current) dataSourceRef.current.show = visible;
    }, [visible]);

    // WebSocket-tilkobling
    useEffect(() => {
        if (!visible) {
            connRef.current?.disconnect();
            connRef.current = null;
            return;
        }

        setLayerLoading('lightning', true);

        let firstStrike = true;
        const conn = new LightningConnection(
            (strike: LightningStrike) => {
                const ds = dataSourceRef.current;
                if (!ds || !visibleRef.current) return;

                if (firstStrike) {
                    firstStrike = false;
                    setLayerLoading('lightning', false);
                    setLayerError('lightning', null);
                }

                const isPositive = strike.polarity >= 0;
                const pos = Cartesian3.fromDegrees(strike.lon, strike.lat);
                const entity = new Entity({
                    id: strike.id,
                    position: new ConstantPositionProperty(pos),
                    billboard: {
                        image: createStrikeIcon(isPositive),
                        width: 12,
                        height: 12,
                        color: new ConstantProperty(Color.fromCssColorString(isPositive ? POSITIVE_COLOR : NEGATIVE_COLOR)),
                        verticalOrigin: VerticalOrigin.CENTER,
                        horizontalOrigin: HorizontalOrigin.CENTER,
                        heightReference: HeightReference.CLAMP_TO_GROUND,
                        disableDepthTestDistance: 1.5e7,
                    },
                });

                ds.entities.add(entity);
                strikeQueueRef.current.push({ strike, entity });

                // Begrens bufferstørrelse
                while (strikeQueueRef.current.length > MAX_STRIKES) {
                    const oldest = strikeQueueRef.current.shift();
                    if (oldest && ds.entities.contains(oldest.entity)) {
                        ds.entities.remove(oldest.entity);
                    }
                }

                setLayerCount('lightning', ds.entities.values.length);
                viewer?.scene.requestRender();
            },
            (msg: string) => {
                setLayerError('lightning', msg);
                setLayerLoading('lightning', false);
            }
        );

        conn.connect();
        connRef.current = conn;

        return () => {
            conn.disconnect();
            connRef.current = null;
        };
    }, [visible, viewer, setLayerLoading, setLayerCount, setLayerError]);

    // Fade-out og TTL-fjerning
    useEffect(() => {
        if (!visible) return;
        tickRef.current = setInterval(() => {
            const ds = dataSourceRef.current;
            if (!ds) return;

            const now = Date.now();
            let removed = 0;

            strikeQueueRef.current = strikeQueueRef.current.filter((rec) => {
                const age = now - rec.strike.ts;
                if (age > TTL_MS) {
                    if (ds.entities.contains(rec.entity)) ds.entities.remove(rec.entity);
                    removed++;
                    return false;
                }
                // Fade opacity basert på alder
                const alpha = Math.max(0, 1 - age / FADE_MS);
                if (rec.entity.billboard) {
                    const isPositive = rec.strike.polarity >= 0;
                    const baseColor = Color.fromCssColorString(isPositive ? POSITIVE_COLOR : NEGATIVE_COLOR);
                    (rec.entity.billboard.color as ConstantProperty).setValue(baseColor.withAlpha(alpha));
                }
                return true;
            });

            if (removed > 0) {
                setLayerCount('lightning', ds.entities.values.length);
                viewer?.scene.requestRender();
            }
        }, 1_000);

        return () => {
            if (tickRef.current) clearInterval(tickRef.current);
        };
    }, [visible, viewer, setLayerCount]);

    return null;
}
