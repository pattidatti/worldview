/**
 * Fixed-size circular buffer for trail-historikk. Unngår array-kloning på hver push.
 *
 * - push(item): O(1), overskriver eldste når full
 * - toArray(): O(n), chronological order (eldste først)
 * - tail(n): O(n), siste n elementer i kronologisk rekkefølge
 * - head(n): O(n), eldste n elementer (unntatt de siste n)
 */
export class TrailBuffer<T> {
    private buf: (T | undefined)[];
    private readonly cap: number;
    private writeIdx = 0;
    private filled = 0;

    constructor(capacity: number) {
        this.cap = capacity;
        this.buf = new Array(capacity);
    }

    push(item: T): void {
        this.buf[this.writeIdx] = item;
        this.writeIdx = (this.writeIdx + 1) % this.cap;
        if (this.filled < this.cap) this.filled++;
    }

    get size(): number {
        return this.filled;
    }

    clear(): void {
        this.buf.fill(undefined);
        this.writeIdx = 0;
        this.filled = 0;
    }

    /** All elementer i kronologisk rekkefølge (eldste først). */
    toArray(): T[] {
        const out: T[] = new Array(this.filled);
        const start = this.filled < this.cap ? 0 : this.writeIdx;
        for (let i = 0; i < this.filled; i++) {
            out[i] = this.buf[(start + i) % this.cap]!;
        }
        return out;
    }

    /** Siste n elementer (kronologisk — nyeste sist). */
    tail(n: number): T[] {
        const take = Math.min(n, this.filled);
        const out: T[] = new Array(take);
        const startOffset = this.filled - take;
        const base = this.filled < this.cap ? 0 : this.writeIdx;
        for (let i = 0; i < take; i++) {
            out[i] = this.buf[(base + startOffset + i) % this.cap]!;
        }
        return out;
    }

    /** Alle bortsett fra siste n (kronologisk — eldste først). */
    head(excludeLastN: number): T[] {
        const take = Math.max(0, this.filled - excludeLastN);
        const out: T[] = new Array(take);
        const base = this.filled < this.cap ? 0 : this.writeIdx;
        for (let i = 0; i < take; i++) {
            out[i] = this.buf[(base + i) % this.cap]!;
        }
        return out;
    }
}
