// Generalisert worker-RPC — feedWorkerClient-mønsteret (lazy singleton,
// seq-id → pending-Map, workerBroken → null = main-thread-fallback) pluss
// det kanalene trenger: push-meldinger initiert av workeren og transferables.

interface RpcEnvelope {
    /** Satt på request/response-par; fraværende på push-meldinger. */
    rpcId?: number;
    /** Meldingstype — brukes til push-ruting. */
    type?: string;
    ok?: boolean;
    error?: string;
}

type Pending = { resolve: (data: unknown) => void; reject: (err: Error) => void };
type PushHandler = (msg: never) => void;

export class WorkerRpc {
    private readonly factory: () => Worker;
    private worker: Worker | null = null;
    private broken = false;
    private seq = 0;
    private pending = new Map<number, Pending>();
    private pushHandlers = new Map<string, Set<PushHandler>>();

    /** factory: () => new Worker(new URL('...', import.meta.url), { type: 'module' }) */
    constructor(factory: () => Worker) {
        this.factory = factory;
    }

    /** false hvis workeren har feilet permanent (eller Worker-API mangler — factory kastet). */
    get available(): boolean {
        return !this.broken;
    }

    /**
     * Request/response-kall. Returnerer null hvis worker er utilgjengelig —
     * kalleren faller da tilbake til main thread (feedWorkerClient-kontrakten).
     */
    call<TRes>(
        msg: object,
        opts?: { signal?: AbortSignal; transfer?: Transferable[] },
    ): Promise<TRes> | null {
        const w = this.getWorker();
        if (!w) return null;
        const rpcId = ++this.seq;
        return new Promise<TRes>((resolve, reject) => {
            this.pending.set(rpcId, { resolve: (d) => resolve(d as TRes), reject });
            opts?.signal?.addEventListener(
                'abort',
                () => {
                    if (this.pending.delete(rpcId)) {
                        reject(new DOMException('Avbrutt', 'AbortError'));
                    }
                },
                { once: true },
            );
            w.postMessage({ ...msg, rpcId }, opts?.transfer ?? []);
        });
    }

    /** Fire-and-forget til workeren. Returnerer false hvis worker er utilgjengelig. */
    post(msg: object, transfer?: Transferable[]): boolean {
        const w = this.getWorker();
        if (!w) return false;
        w.postMessage(msg, transfer ?? []);
        return true;
    }

    /** Abonner på push-meldinger (meldinger fra worker uten rpcId), rutet på `type`. */
    onPush<TMsg>(type: string, fn: (msg: TMsg) => void): () => void {
        let set = this.pushHandlers.get(type);
        if (!set) {
            set = new Set();
            this.pushHandlers.set(type, set);
        }
        set.add(fn as PushHandler);
        return () => {
            set.delete(fn as PushHandler);
        };
    }

    terminate(): void {
        this.worker?.terminate();
        this.worker = null;
        this.rejectAll(new Error('Worker terminert'));
    }

    private getWorker(): Worker | null {
        if (this.broken) return null;
        if (this.worker) return this.worker;
        try {
            // Factory kaster hvis Worker-API mangler (SSR/gamle miljøer) —
            // fanges under og gir permanent main-thread-fallback.
            const w = this.factory();
            w.onmessage = (e: MessageEvent<RpcEnvelope>) => this.onMessage(e.data);
            w.onerror = () => {
                // Workeren lastet/kjørte ikke — avvis alt in-flight og deaktiver
                // permanent slik at senere kall bruker main-thread-fallback.
                this.broken = true;
                this.rejectAll(new Error('Worker feilet'));
                this.worker?.terminate();
                this.worker = null;
            };
            this.worker = w;
        } catch {
            this.broken = true;
            this.worker = null;
        }
        return this.worker;
    }

    private onMessage(data: RpcEnvelope): void {
        if (data.rpcId !== undefined) {
            const p = this.pending.get(data.rpcId);
            if (!p) return;
            this.pending.delete(data.rpcId);
            if (data.ok === false) p.reject(new Error(data.error ?? 'Worker-feil'));
            else p.resolve(data);
            return;
        }
        if (data.type) {
            const handlers = this.pushHandlers.get(data.type);
            if (handlers) {
                for (const fn of handlers) (fn as (msg: RpcEnvelope) => void)(data);
            }
        }
    }

    private rejectAll(err: Error): void {
        for (const p of this.pending.values()) p.reject(err);
        this.pending.clear();
    }
}
