import { useEffect, useRef } from 'react';
import { GeoJsonDataSource, Color, JulianDate, Material, Event as CesiumEvent } from 'cesium';
import { useViewer } from '@/context/ViewerContext';
import { useLayerActions, useLayerVisibility } from '@/store/layerStore';
import { usePopupRegistry } from '@/context/PopupRegistry';
import { useTooltipRegistry } from '@/context/TooltipRegistry';

// Register custom animated material type once
// UV.s = posisjon langs polyline (0→1), czm_frameNumber = GPU render-teller
// 3 datapakker jevnt fordelt, smoothstep-topper som flyter i kabelens farge
const FLOW_MATERIAL_TYPE = 'FlowCable';
let _flowMaterialRegistered = false;
if (!_flowMaterialRegistered) {
    _flowMaterialRegistered = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Material as any)._materialCache.addMaterial(FLOW_MATERIAL_TYPE, {
            fabric: {
                type: FLOW_MATERIAL_TYPE,
                uniforms: {
                    color: new Color(0, 0.83, 1, 0.9),
                    speed: 0.4,
                },
                source: `
                    uniform vec4 color;
                    uniform float speed;
                    czm_material czm_getMaterial(czm_materialInput materialInput) {
                        czm_material material = czm_getDefaultMaterial(materialInput);
                        float s = materialInput.st.s;
                        float t = float(czm_frameNumber) * speed * 0.004;

                        // 3 pakker staggeret 1/3 fra hverandre langs kabelen
                        float s3 = s * 3.0;
                        float p1 = smoothstep(0.0, 0.07, fract(s3 - t)) * smoothstep(0.22, 0.07, fract(s3 - t));
                        float p2 = smoothstep(0.0, 0.07, fract(s3 - t + 0.333)) * smoothstep(0.22, 0.07, fract(s3 - t + 0.333));
                        float p3 = smoothstep(0.0, 0.07, fract(s3 - t + 0.667)) * smoothstep(0.22, 0.07, fract(s3 - t + 0.667));
                        float p = clamp(p1 + p2 + p3, 0.0, 1.0);

                        material.diffuse = color.rgb;
                        material.emission = color.rgb * (0.18 + p * 2.2);
                        material.alpha = color.a * (0.28 + p * 0.72);
                        return material;
                    }
                `,
            },
            translucent: () => true,
        });
}

/** Custom MaterialProperty som driver FlowCable-shaderen per kabel */
class FlowCableMaterialProperty {
    readonly isConstant = false;
    readonly definitionChanged = new CesiumEvent();
    private _color: Color;
    private _speed: number;

    constructor(color: Color, speed: number) {
        this._color = color;
        this._speed = speed;
    }

    getType(_time: unknown): string {
        return FLOW_MATERIAL_TYPE;
    }

    getValue(_time: unknown, result: Record<string, unknown> = {}): Record<string, unknown> {
        result.color = this._color;
        result.speed = this._speed;
        return result;
    }

    equals(other: unknown): boolean {
        return this === other;
    }
}

export function SubmarineCableLayer() {
    const viewer = useViewer();
    const { setLayerLoading, setLayerCount, setLayerError } = useLayerActions();
    const { register, unregister } = usePopupRegistry();
    const { register: tooltipRegister, unregister: tooltipUnregister } = useTooltipRegistry();
    const dsRef = useRef<GeoJsonDataSource | null>(null);
    const visible = useLayerVisibility('submarineCables');

    // Register popup builder
    useEffect(() => {
        register('submarineCables', (entity) => {
            if (!dsRef.current?.entities.contains(entity)) return null;
            const props = entity.properties;
            if (!props) return null;
            const name = props.name?.getValue(JulianDate.now()) ?? 'Sjøkabel';
            const operator = props.operator?.getValue(JulianDate.now()) ?? '';
            const color = props.color?.getValue(JulianDate.now()) ?? '#00d4ff';

            return {
                title: name,
                icon: '🌊',
                color,
                fields: [
                    ...(operator ? [{ label: 'Operatør', value: operator }] : []),
                ],
            };
        });
        return () => unregister('submarineCables');
    }, [register, unregister]);

    // Register tooltip builder
    useEffect(() => {
        tooltipRegister('submarineCables', (entity) => {
            if (!dsRef.current?.entities.contains(entity)) return null;
            const props = entity.properties;
            const name = props?.name?.getValue(JulianDate.now()) ?? 'Sjøkabel';
            const color = props?.color?.getValue(JulianDate.now()) ?? '#00d4ff';
            return { title: name, icon: '🌊', color };
        });
        return () => tooltipUnregister('submarineCables');
    }, [tooltipRegister, tooltipUnregister]);

    // Load/show/hide data
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return;
        let cancelled = false;

        async function apply() {
            if (!visible) {
                if (dsRef.current) dsRef.current.show = false;
                viewer!.scene.requestRender();
                return;
            }

            if (dsRef.current) {
                dsRef.current.show = true;
                viewer!.scene.requestRender();
                return;
            }

            setLayerLoading('submarineCables', true);
            try {
                const ds = await GeoJsonDataSource.load('/data/submarine-cables.geojson', {
                    stroke: Color.fromCssColorString('#00d4ff').withAlpha(0.85),
                    strokeWidth: 4,
                    clampToGround: true,
                    describe: () => undefined,
                });
                if (cancelled) return;
                dsRef.current = ds;
                await viewer!.dataSources.add(ds);
                setLayerCount('submarineCables', ds.entities.values.length);

                // Bytt til animert flow-material per kabel, med kabelens farge og litt variasjon i hastighet
                for (const entity of ds.entities.values) {
                    const colorStr = entity.properties?.color?.getValue(JulianDate.now());
                    if (entity.polyline) {
                        const col = colorStr
                            ? Color.fromCssColorString(colorStr).withAlpha(0.9)
                            : Color.fromCssColorString('#00d4ff').withAlpha(0.9);
                        // Slight speed variation per cable for natural look
                        const speed = 0.28 + Math.random() * 0.22;
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        entity.polyline.material = new FlowCableMaterialProperty(col, speed) as any;
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        entity.polyline.width = 3 as any;
                    }
                }
            } catch (e) {
                if (cancelled) return;
                if (import.meta.env.DEV) console.error('[SubmarineCableLayer]', e);
                setLayerError('submarineCables', 'Feil ved lasting av sjøkabler');
            } finally {
                if (!cancelled) setLayerLoading('submarineCables', false);
            }

            if (!cancelled) viewer!.scene.requestRender();
        }

        apply();
        return () => { cancelled = true; };
    }, [viewer, visible, setLayerLoading, setLayerCount, setLayerError]);

    // Render-loop: driver animasjon ved å be om ny frame ~20fps når laget er synlig
    useEffect(() => {
        if (!viewer || !visible) return;
        const id = setInterval(() => {
            if (!viewer.isDestroyed()) viewer.scene.requestRender();
        }, 50);
        return () => clearInterval(id);
    }, [viewer, visible]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (dsRef.current && viewer && !viewer.isDestroyed()) {
                viewer.dataSources.remove(dsRef.current, true);
            }
        };
    }, [viewer]);

    return null;
}
