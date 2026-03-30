export type ConflictEventType =
    | 'Battles'
    | 'Violence against civilians'
    | 'Explosions/Remote violence'
    | 'Riots'
    | 'Protests'
    | 'Strategic developments';

export interface ConflictEvent {
    id: string;
    eventDate: string;
    eventType: ConflictEventType;
    subEventType: string;
    actor1: string;
    actor2: string;
    country: string;
    admin1: string;
    lat: number;
    lon: number;
    fatalities: number;
    notes: string;
    source: string;
}
