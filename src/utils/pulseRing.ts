import {
    CustomDataSource,
    Entity,
    Cartesian3,
    Color,
    CallbackProperty,
    HeightReference,
    JulianDate,
} from 'cesium';

/**
 * Spawner en pulserende ring på globusen som ekspanderer og fader ut, deretter slettes.
 * Bruker Cesium CallbackProperty for å animere radius og farge per frame.
 *
 * Bruker Cesium JulianDate-parameteren (ikke Date.now()) slik at begge akse-callbacks
 * mottar nøyaktig samme tid og alltid returnerer lik verdi — unngår race condition
 * der semiMajorAxis < semiMinorAxis og Cesium kaster DeveloperError.
 */
export function spawnPulseRing(
    ds: CustomDataSource,
    position: Cartesian3,
    color: Color,
    durationMs = 1400,
): void {
    const startMs = Date.now();
    const id = `pulse-${startMs}-${Math.random().toString(36).slice(2, 7)}`;
    const pos = new Cartesian3(position.x, position.y, position.z);
    const startJd = JulianDate.fromDate(new Date(startMs));
    const durationS = durationMs / 1000;

    // Bruker `time`-argumentet fra Cesium (ikke Date.now()) — begge aksene mottar
    // samme JulianDate i samme tick og beregner dermed alltid identisk radius.
    const radius = new CallbackProperty((time: JulianDate | undefined) => {
        const elapsedS = time ? JulianDate.secondsDifference(time, startJd) : 0;
        const t = Math.min(Math.max(elapsedS / durationS, 0), 1);
        return t * 50_000 + 1; // starter på 1m, vokser til ~50 km
    }, false);

    const outlineColor = new CallbackProperty((time: JulianDate | undefined) => {
        const elapsedS = time ? JulianDate.secondsDifference(time, startJd) : 0;
        const t = Math.min(Math.max(elapsedS / durationS, 0), 1);
        return color.withAlpha((1 - t) * 0.85);
    }, false);

    ds.entities.add(new Entity({
        id,
        position: pos,
        ellipse: {
            semiMajorAxis: radius,
            semiMinorAxis: radius,
            fill: false,
            outline: true,
            outlineColor,
            outlineWidth: 2,
            heightReference: HeightReference.CLAMP_TO_GROUND,
        },
    }));

    setTimeout(() => {
        try { ds.entities.removeById(id); } catch { /* allerede fjernet */ }
    }, durationMs + 150);
}
