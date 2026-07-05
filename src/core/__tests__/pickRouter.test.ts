import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pickRouter } from '../pickRouter';

const POS = { x: 100, y: 200 };

describe('pickRouter', () => {
    beforeEach(() => pickRouter._clear());

    it('ruter på prefiks og returnerer handler-resultatet', () => {
        const handler = vi.fn().mockReturnValue(true);
        pickRouter.register('flight:', handler);
        expect(pickRouter.route('flight:abc123', POS)).toBe(true);
        expect(handler).toHaveBeenCalledWith('flight:abc123', POS);
    });

    it('handler som returnerer false → route returnerer false', () => {
        pickRouter.register('flight:', () => false);
        expect(pickRouter.route('flight:abc', POS)).toBe(false);
    });

    it('ukjent prefiks og ikke-string id håndteres ikke', () => {
        pickRouter.register('flight:', () => true);
        expect(pickRouter.route('ship:123', POS)).toBe(false);
        expect(pickRouter.route(undefined, POS)).toBe(false);
        expect(pickRouter.route({ some: 'entity' }, POS)).toBe(false);
    });

    it('unregister fjerner handleren, men ikke en nyere registrering', () => {
        const first = vi.fn().mockReturnValue(true);
        const unregisterFirst = pickRouter.register('flight:', first);
        const second = vi.fn().mockReturnValue(true);
        pickRouter.register('flight:', second);

        unregisterFirst(); // skal IKKE fjerne second (som har overtatt prefikset)
        expect(pickRouter.route('flight:x', POS)).toBe(true);
        expect(second).toHaveBeenCalled();
        expect(first).not.toHaveBeenCalled();
    });

    it('flere prefikser rutes uavhengig', () => {
        const flight = vi.fn().mockReturnValue(true);
        const ship = vi.fn().mockReturnValue(true);
        pickRouter.register('flight:', flight);
        pickRouter.register('ship:', ship);
        pickRouter.route('ship:42', POS);
        expect(ship).toHaveBeenCalled();
        expect(flight).not.toHaveBeenCalled();
    });
});
