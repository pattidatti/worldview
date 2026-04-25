import { CustomDataSource, Entity, Billboard, Label, PointPrimitive } from 'cesium';

interface ClusterConfig {
    pixelRange: number;
    minimumClusterSize: number;
    color: string;
}

const iconCache = new Map<string, string>();

function sizeForCount(count: number): number {
    if (count < 10) return 32;
    if (count < 50) return 40;
    return 48;
}

function lightenHex(hex: string, amount = 0.35): string {
    const c = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, Math.round(((c >> 16) & 0xff) + (255 - ((c >> 16) & 0xff)) * amount));
    const g = Math.min(255, Math.round(((c >> 8) & 0xff)  + (255 - ((c >> 8) & 0xff))  * amount));
    const b = Math.min(255, Math.round(( c        & 0xff)  + (255 - ( c        & 0xff))  * amount));
    return `rgb(${r},${g},${b})`;
}

function createClusterIcon(count: number, color: string): string {
    const large = count >= 20;
    const key = `${count}-${color}-${large ? 'lg' : 'sm'}`;
    const cached = iconCache.get(key);
    if (cached) return cached;

    const size = sizeForCount(count);
    const r = size / 2;
    const fontSize = count >= 100 ? 10 : count >= 10 ? 12 : 14;
    const safeKey = key.replace(/[^a-zA-Z0-9]/g, '_');
    const gradId = `g_${safeKey}`;
    const filterId = `f_${safeKey}`;
    const light = lightenHex(color, 0.4);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
        <defs>
            <radialGradient id="${gradId}" cx="35%" cy="30%" r="65%">
                <stop offset="0%"   stop-color="${light}" stop-opacity="0.95"/>
                <stop offset="50%"  stop-color="${color}" stop-opacity="0.65"/>
                <stop offset="100%" stop-color="${color}" stop-opacity="0.12"/>
            </radialGradient>
            <filter id="${filterId}" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="3" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <circle cx="${r}" cy="${r}" r="${r + 3}" fill="none"
                stroke="${color}" stroke-width="2" stroke-opacity="0.28"/>
        <circle cx="${r}" cy="${r}" r="${r - 2}" fill="url(#${gradId})"
                stroke="${color}" stroke-width="1.5" stroke-opacity="0.85"
                filter="url(#${filterId})"/>
        ${large ? `<circle cx="${r}" cy="${r}" r="${r - 1}" fill="none"
                stroke="${color}" stroke-width="1" stroke-dasharray="4 3" stroke-opacity="0.55"/>` : ''}
        <text x="${r}" y="${r}" text-anchor="middle" dominant-baseline="central"
              fill="white" font-family="JetBrains Mono, monospace" font-size="${fontSize}" font-weight="bold"
              style="text-shadow: 0 0 4px rgba(0,0,0,0.9)">
            ${count}
        </text>
    </svg>`;
    const uri = 'data:image/svg+xml,' + encodeURIComponent(svg);
    iconCache.set(key, uri);
    return uri;
}

export function configureCluster(ds: CustomDataSource, config: ClusterConfig): void {
    ds.clustering.enabled = true;
    ds.clustering.pixelRange = config.pixelRange;
    ds.clustering.minimumClusterSize = config.minimumClusterSize;
    ds.clustering.clusterBillboards = true;
    ds.clustering.clusterPoints = true;
    ds.clustering.clusterLabels = true;

    ds.clustering.clusterEvent.addEventListener(
        (clusteredEntities: Entity[], cluster: { billboard: Billboard; label: Label; point: PointPrimitive }) => {
            const count = clusteredEntities.length;
            const size = sizeForCount(count);

            cluster.billboard.show = true;
            cluster.billboard.image = createClusterIcon(count, config.color);
            cluster.billboard.width = size;
            cluster.billboard.height = size;

            cluster.label.show = false;
            cluster.point.show = false;
        }
    );
}
