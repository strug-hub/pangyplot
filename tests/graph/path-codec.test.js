import { describe, it, expect } from 'vitest';
import { decodeSteps, encodeSteps } from '@graph/engines/path-trace/path-codec.js';

// Helper: encode then decode and compare
function roundTrip(steps) {
    const encoded = encodeSteps(steps);
    return decodeSteps(encoded);
}

describe('path-codec', () => {

    describe('empty input', () => {
        it('decodes empty Uint8Array to empty array', () => {
            expect(decodeSteps(new Uint8Array(0))).toEqual([]);
        });

        it('encodes empty array to empty Uint8Array', () => {
            expect(encodeSteps([])).toEqual(new Uint8Array(0));
        });
    });

    describe('round-trip', () => {
        it('single forward step', () => {
            const steps = [{ segId: 42, direction: '+' }];
            expect(roundTrip(steps)).toEqual(steps);
        });

        it('single reverse step', () => {
            const steps = [{ segId: 42, direction: '-' }];
            expect(roundTrip(steps)).toEqual(steps);
        });

        it('sequential forward', () => {
            const steps = [1, 2, 3, 4, 5].map(id => ({ segId: id, direction: '+' }));
            expect(roundTrip(steps)).toEqual(steps);
        });

        it('sequential reverse', () => {
            const steps = [500, 499, 498, 497].map(id => ({ segId: id, direction: '-' }));
            expect(roundTrip(steps)).toEqual(steps);
        });

        it('mixed directions', () => {
            const steps = [
                { segId: 10, direction: '+' },
                { segId: 11, direction: '+' },
                { segId: 12, direction: '-' },
                { segId: 13, direction: '+' },
                { segId: 14, direction: '-' },
            ];
            expect(roundTrip(steps)).toEqual(steps);
        });

        it('large gap', () => {
            const steps = [
                { segId: 1, direction: '+' },
                { segId: 100000, direction: '+' },
                { segId: 2, direction: '-' },
            ];
            expect(roundTrip(steps)).toEqual(steps);
        });

        it('direction flip same segment', () => {
            const steps = [
                { segId: 500, direction: '+' },
                { segId: 500, direction: '-' },
            ];
            expect(roundTrip(steps)).toEqual(steps);
        });

        it('non-sequential ids (unsorted graph)', () => {
            const steps = [
                { segId: 500, direction: '+' },
                { segId: 200, direction: '-' },
                { segId: 700, direction: '+' },
                { segId: 300, direction: '-' },
                { segId: 100, direction: '+' },
            ];
            expect(roundTrip(steps)).toEqual(steps);
        });

        it('segment id zero', () => {
            const steps = [{ segId: 0, direction: '+' }];
            expect(roundTrip(steps)).toEqual(steps);
        });

        it('large path (10k steps)', () => {
            // Deterministic pseudo-random
            let seed = 42;
            function nextRand() {
                seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF;
                return seed;
            }

            const steps = [];
            let segId = 1;
            for (let i = 0; i < 10000; i++) {
                const direction = nextRand() % 3 === 0 ? '-' : '+';
                steps.push({ segId, direction });
                const deltas = [1, 1, 1, 2, 5, 100];
                segId += deltas[nextRand() % deltas.length];
            }
            expect(roundTrip(steps)).toEqual(steps);
        });
    });

    describe('cross-compatibility with Python codec', () => {
        it('decodes bytes produced by Python encoder', () => {
            // Python: encode_steps(["1+", "2+", "3+", "100-", "99-"])
            // Raw varint bytes (after gzip decompress): [2, 4, 4, 134, 3, 3]
            const pythonBytes = new Uint8Array([2, 4, 4, 134, 3, 3]);

            const expected = [
                { segId: 1, direction: '+' },
                { segId: 2, direction: '+' },
                { segId: 3, direction: '+' },
                { segId: 100, direction: '-' },
                { segId: 99, direction: '-' },
            ];

            expect(decodeSteps(pythonBytes)).toEqual(expected);
        });

        it('produces same bytes as Python encoder', () => {
            const steps = [
                { segId: 1, direction: '+' },
                { segId: 2, direction: '+' },
                { segId: 3, direction: '+' },
                { segId: 100, direction: '-' },
                { segId: 99, direction: '-' },
            ];

            const encoded = encodeSteps(steps);
            expect(Array.from(encoded)).toEqual([2, 4, 4, 134, 3, 3]);
        });
    });
});
