import { CustomDataSource, Entity } from 'cesium';

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
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
        <circle cx="${r}" cy="${r}" r="${r - 1}" fill="${color}22" stroke="${color}" stroke-width="2"/>
        <circle cx="${r}" cy="${r}" r="${r - 4}" fill="${color}44"/>
        <text x="${r}" y="${r}" text-anchor="middle" dominant-baseline="central"
              fill="white" font-family="JetBrains Mono, monospace" font-size="${fontSize}" font-weight="bold">
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
        (clusteredEntities: Entity[], cluster: { billboard: any; label: any; point: any }) => {
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
