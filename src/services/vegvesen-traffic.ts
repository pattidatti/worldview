import { type TrafficEvent } from '@/types/traffic';

const DATEX_SITUATIONS_URL =
    'https://datex.vegvesen.no/datexapi/Situation';

interface DatexSituation {
    situationId: string;
    situationRecords: DatexRecord[];
}

interface DatexRecord {
    situationRecordType: string;
    generalPublicComment?: { value: string }[];
    severity?: string;
    validity?: { validityTimeSpecification?: { overallStartTime?: string } };
    locationReference?: {
        pointByCoordinates?: {
            pointCoordinates?: { latitude: number; longitude: number };
        };
    };
    roadNumber?: string;
}

function mapSeverity(s?: string): 'low' | 'medium' | 'high' {
    switch (s?.toLowerCase()) {
        case 'highest':
        case 'high':
            return 'high';
        case 'medium':
            return 'medium';
        default:
            return 'low';
    }
}

function mapType(type: string): string {
    const types: Record<string, string> = {
        AbnormalTraffic: 'Unormal trafikk',
        Accident: 'Ulykke',
        MaintenanceWorks: 'Veiarbeid',
        RoadOrCarriagewayOrLaneManagement: 'Vegforvaltning',
        NetworkManagement: 'Nettverk',
        ConstructionWorks: 'Byggearbeid',
        Obstruction: 'Hindring',
        WeatherRelatedRoadConditions: 'Vær/føre',
        AnimalPresenceObstruction: 'Dyr i vegen',
        GeneralObstruction: 'Generell hindring',
    };
    return types[type] ?? type;
}

export async function fetchTrafficEvents(): Promise<TrafficEvent[]> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(DATEX_SITUATIONS_URL, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) return [];

        const data = await res.json();
        const situations: DatexSituation[] = data?.situations ?? data ?? [];
        const events: TrafficEvent[] = [];

        for (const sit of situations) {
            if (!sit.situationRecords?.length) continue;

            for (const rec of sit.situationRecords) {
                const coords = rec.locationReference?.pointByCoordinates?.pointCoordinates;
                if (!coords?.latitude || !coords?.longitude) continue;

                const description =
                    rec.generalPublicComment?.[0]?.value ?? mapType(rec.situationRecordType);

                events.push({
                    id: `${sit.situationId}-${events.length}`,
                    type: mapType(rec.situationRecordType),
                    description,
                    lat: coords.latitude,
                    lon: coords.longitude,
                    severity: mapSeverity(rec.severity),
                    startTime: rec.validity?.validityTimeSpecification?.overallStartTime ?? '',
                    roadNumber: rec.roadNumber,
                });
            }
        }

        return events;
    } catch {
        // API utilgjengelig — returnér tom liste
        return [];
    }
}
