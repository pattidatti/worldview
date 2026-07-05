import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkerRpc } from '../workerRpc';

/** Minimal mock av Worker-API-et som lar testen spille inn svar/push/feil. */
class MockWorker {
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    postMessage = vi.fn();
    terminate = vi.fn();

    receive(data: unknown): void {
        this.onmessage?.({ data } as MessageEvent);
    }

    fail(): void {
        this.onerror?.(new Event('error'));
    }
}

describe('WorkerRpc', () => {
    let mock: MockWorker;
    let rpc: WorkerRpc;

    beforeEach(() => {
        mock = new MockWorker();
        rpc = new WorkerRpc(() => mock as unknown as Worker);
    });

    it('call sender melding med rpcId og resolver på matchende svar', async () => {
        const promise = rpc.call<{ value: number }>({ type: 'ping' });
        expect(promise).not.toBeNull();
        const sent = mock.postMessage.mock.calls[0][0];
        expect(sent.type).toBe('ping');
        expect(sent.rpcId).toBeGreaterThan(0);

        mock.receive({ rpcId: sent.rpcId, ok: true, value: 42 });
        await expect(promise).resolves.toMatchObject({ value: 42 });
    });

    it('call rejecter på ok:false-svar', async () => {
        const promise = rpc.call({ type: 'ping' })!;
        const sent = mock.postMessage.mock.calls[0][0];
        mock.receive({ rpcId: sent.rpcId, ok: false, error: 'Kaboom' });
        await expect(promise).rejects.toThrow('Kaboom');
    });

    it('abort-signal rejecter med AbortError og ignorerer senere svar', async () => {
        const controller = new AbortController();
        const promise = rpc.call({ type: 'ping' }, { signal: controller.signal })!;
        const sent = mock.postMessage.mock.calls[0][0];
        controller.abort();
        await expect(promise).rejects.toThrow(/Avbrutt/);
        // Sent svar etter abort skal ikke krasje
        mock.receive({ rpcId: sent.rpcId, ok: true });
    });

    it('worker-feil avviser in-flight og gjør rpc permanent utilgjengelig', async () => {
        const promise = rpc.call({ type: 'ping' })!;
        mock.fail();
        await expect(promise).rejects.toThrow(/Worker feilet/);
        expect(rpc.available).toBe(false);
        expect(rpc.call({ type: 'ping' })).toBeNull();
        expect(rpc.post({ type: 'x' })).toBe(false);
    });

    it('factory som kaster gjør rpc utilgjengelig uten å kaste videre', () => {
        const broken = new WorkerRpc(() => {
            throw new Error('CSP blokkerte worker');
        });
        expect(broken.call({ type: 'ping' })).toBeNull();
        expect(broken.available).toBe(false);
    });

    it('push-meldinger (uten rpcId) rutes på type til abonnenter', () => {
        const onDelta = vi.fn();
        const onOther = vi.fn();
        rpc.onPush('flights/delta', onDelta);
        rpc.onPush('ships/delta', onOther);
        rpc.post({ type: 'ping' }); // instansier worker

        mock.receive({ type: 'flights/delta', upserts: [1, 2] });
        expect(onDelta).toHaveBeenCalledWith({ type: 'flights/delta', upserts: [1, 2] });
        expect(onOther).not.toHaveBeenCalled();
    });

    it('onPush-avmelding stopper ruting', () => {
        const fn = vi.fn();
        const unsub = rpc.onPush('flights/delta', fn);
        rpc.post({ type: 'ping' });
        unsub();
        mock.receive({ type: 'flights/delta' });
        expect(fn).not.toHaveBeenCalled();
    });

    it('post sender transferables videre', () => {
        const buffer = new Float64Array(4).buffer;
        rpc.post({ type: 'buf' }, [buffer]);
        expect(mock.postMessage).toHaveBeenCalledWith({ type: 'buf' }, [buffer]);
    });
});
