// Lazy singleton-RPC mot channel-workeren — deles av alle kanaler
// (flights i fase B, ships m.fl. i fase C).

import { WorkerRpc } from '@/data/workerRpc';

export const channelWorkerRpc = new WorkerRpc(
    () => new Worker(new URL('../workers/channel.worker.ts', import.meta.url), { type: 'module' }),
);
