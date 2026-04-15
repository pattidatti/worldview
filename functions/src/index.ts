import { onSchedule } from 'firebase-functions/v2/scheduler';
import { setGlobalOptions } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { runFlightsSnapshot, runShipsSnapshot, runEventsSnapshot } from './snapshotWorker';

admin.initializeApp();

setGlobalOptions({
    region: 'europe-west1',
    memory: '512MiB',
});

const AISSTREAM_API_KEY = defineSecret('AISSTREAM_API_KEY');

export const snapshotFlights = onSchedule(
    {
        schedule: 'every 10 minutes',
        timeoutSeconds: 120,
    },
    async () => {
        await runFlightsSnapshot();
    },
);

export const snapshotShips = onSchedule(
    {
        schedule: 'every 5 minutes',
        timeoutSeconds: 60,
        secrets: [AISSTREAM_API_KEY],
    },
    async () => {
        await runShipsSnapshot(AISSTREAM_API_KEY.value());
    },
);

export const snapshotEvents = onSchedule(
    {
        schedule: 'every 10 minutes',
        timeoutSeconds: 120,
    },
    async () => {
        await runEventsSnapshot();
    },
);
