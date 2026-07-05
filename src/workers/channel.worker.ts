/// <reference lib="webworker" />
// Stateful kanal-worker (jf. docs/ARCHITECTURE-VISION.md, dataplanet): holder
// sesjoner per kanal-id med egen poll-syklus og dead-reckoning-løkke, og
// poster posisjonsbuffere som transferable Float64Array til main thread.
//
// Bevisst adskilt fra feedParser.worker.ts: den er statuløs request/response
// for GDELT/ACLED, og en feil i kanal-koden skal ikke deaktivere feed-parsing
// (workerBroken-flagget i RPC-klienten er permanent).
//
// Fase A: kun skjelett (ping/dispose) + meldingstype-unioner. Kanal-sesjoner
// (flights m.fl.) kommer i Fase B.

// ---- Meldingstyper (importeres type-only fra main thread) ----

export interface ChannelPingRequest {
    rpcId: number;
    type: 'ping';
}

export interface ChannelDisposeRequest {
    rpcId: number;
    type: 'dispose';
}

export type ChannelWorkerRequest = ChannelPingRequest | ChannelDisposeRequest;

export interface ChannelPongResponse {
    rpcId: number;
    ok: true;
    type: 'pong';
}

export interface ChannelErrorResponse {
    rpcId: number;
    ok: false;
    error: string;
}

export type ChannelWorkerResponse = ChannelPongResponse | ChannelErrorResponse;

/** Push-meldinger (uten rpcId) — fylles ut per kanal i Fase B. */
export type ChannelWorkerPush = never;

// ---- Sesjonsholder ----

export interface ChannelSession {
    dispose(): void;
}

const sessions = new Map<string, ChannelSession>();

export function registerSession(id: string, session: ChannelSession): void {
    sessions.get(id)?.dispose();
    sessions.set(id, session);
}

function disposeAll(): void {
    for (const session of sessions.values()) session.dispose();
    sessions.clear();
}

// ---- Meldingsløkke ----

const scope = self as unknown as Worker;

scope.onmessage = (e: MessageEvent<ChannelWorkerRequest>) => {
    const msg = e.data;
    try {
        switch (msg.type) {
            case 'ping':
                scope.postMessage({ rpcId: msg.rpcId, ok: true, type: 'pong' } satisfies ChannelPongResponse);
                break;
            case 'dispose':
                disposeAll();
                scope.postMessage({ rpcId: msg.rpcId, ok: true, type: 'pong' } satisfies ChannelPongResponse);
                break;
        }
    } catch (err) {
        scope.postMessage({
            rpcId: msg.rpcId,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
        } satisfies ChannelErrorResponse);
    }
};
