import { type RocketLaunch } from '@/types/launch';

const URL = 'https://ll.thespacedevs.com/2.3.0/launch/upcoming/?limit=20&status__lte=2&ordering=net';

interface LaunchEntry {
    id: string;
    name: string;
    net: string;
    status?: { name: string };
    image?: { image_url?: string };
    launch_service_provider?: { name: string };
    rocket?: { configuration?: { name: string } };
    mission?: { description?: string };
    pad?: { name: string; latitude?: string | null; longitude?: string | null };
    url?: string;
}

export async function fetchLaunches(): Promise<RocketLaunch[]> {
    const res = await fetch(URL, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Launch Library: ${res.status}`);
    const data = await res.json() as { results: LaunchEntry[] };
    return data.results
        .filter((e) => {
            const lat = parseFloat(e.pad?.latitude ?? '');
            const lon = parseFloat(e.pad?.longitude ?? '');
            return Number.isFinite(lat) && Number.isFinite(lon);
        })
        .map((e): RocketLaunch => ({
            id: e.id,
            name: e.name,
            provider: e.launch_service_provider?.name ?? '',
            lat: parseFloat(e.pad!.latitude!),
            lon: parseFloat(e.pad!.longitude!),
            net: e.net,
            statusName: e.status?.name ?? '',
            imageUrl: e.image?.image_url,
            infoUrl: e.url,
            padName: e.pad?.name ?? '',
            missionDescription: e.mission?.description,
            rocketName: e.rocket?.configuration?.name,
        }));
}
