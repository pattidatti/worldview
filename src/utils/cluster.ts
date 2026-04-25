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

function createClusterIcon(count: number, color: string): string {
    const key = `${count}-${color}`;
    const cached = iconCache.get(key);
    if (cached) return cached;

    const size = sizeForCount(count);
    const r = size / 2;
    const fontSize = count >= 100 ? 10 : count >= 10 ? 12 : 14;
    const gradId = `g${count}`;
    const filterId = `f${count}`;
    // Radial gradient fra lys kjerne → transparent kant, + Gaussian glow
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
        <defs>
            <radialGradient id="${gradId}" cx="40%" cy="35%" r="60%">
                <stop offset="0%"   stop-color="${color}" stop-opacity="0.9"/>
                <stop offset="60%"  stop-color="${color}" stop-opacity="0.45"/>
                <stop offset="100%" stop-color="${color}" stop-opacity="0.1"/>
            </radialGradient>
            <filter id="${filterId}" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="2" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <circle cx="${r}" cy="${r}" r="${r - 1}" fill="url(#${gradId})"
                stroke="${color}" stroke-width="1.5" stroke-opacity="0.7"
                filter="url(#${filterId})"/>
        <text x="${r}" y="${r}" text-anchor="middle" dominant-baseline="central"
              fill="white" font-family="JetBrains Mono, monospace" font-size="${fontSize}" font-weight="bold"
              style="text-shadow: 0 0 4px rgba(0,0,0,0.8)">
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
