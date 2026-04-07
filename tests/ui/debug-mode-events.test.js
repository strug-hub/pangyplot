import { describe, it, expect, beforeEach } from 'vitest';
import eventBus from '@event-bus';

// --- helpers ---

function collectEvents(eventName) {
    const events = [];
    eventBus.subscribe(eventName, (data) => events.push(data));
    return events;
}

beforeEach(() => {
    for (const key of Object.keys(eventBus.events)) {
        delete eventBus.events[key];
    }
});

// =============================================================================
// Debug mode toggle
// Mirrors setDebugMode from app-state.js:12-17
// =============================================================================

function createDebugState(initial = false) {
    let _debugMode = initial;
    return {
        isDebugMode() { return _debugMode; },
        setDebugMode(enabled) {
            if (_debugMode === enabled) return;
            _debugMode = enabled;
            eventBus.publish('app:debug-mode-changed', _debugMode);
        },
    };
}

describe('debug mode toggle publishes app:debug-mode-changed', () => {
    it('emits true when toggled on', () => {
        const received = collectEvents('app:debug-mode-changed');
        const state = createDebugState(false);

        state.setDebugMode(true);

        expect(received).toHaveLength(1);
        expect(received[0]).toBe(true);
    });

    it('emits false when toggled off', () => {
        const received = collectEvents('app:debug-mode-changed');
        const state = createDebugState(true);

        state.setDebugMode(false);

        expect(received).toHaveLength(1);
        expect(received[0]).toBe(false);
    });

    it('does not emit when value unchanged', () => {
        const received = collectEvents('app:debug-mode-changed');
        const state = createDebugState(true);

        state.setDebugMode(true);

        expect(received).toHaveLength(0);
    });

    it('emits on each toggle', () => {
        const received = collectEvents('app:debug-mode-changed');
        const state = createDebugState(false);

        state.setDebugMode(true);
        state.setDebugMode(false);
        state.setDebugMode(true);

        expect(received).toHaveLength(3);
        expect(received).toEqual([true, false, true]);
    });
});

// =============================================================================
// Debug mode subscribers
// =============================================================================

describe('debug mode subscribers', () => {
    it('navbar version overlay receives debug state', () => {
        let overlayBg = '';

        // Simulates navbar.js:24-25 subscriber
        eventBus.subscribe('app:debug-mode-changed', (enabled) => {
            overlayBg = enabled ? 'var(--highlight)' : '';
        });

        const state = createDebugState(false);
        state.setDebugMode(true);

        expect(overlayBg).toBe('var(--highlight)');
    });

    it('version overlay clears highlight when debug off', () => {
        let overlayBg = 'var(--highlight)';

        eventBus.subscribe('app:debug-mode-changed', (enabled) => {
            overlayBg = enabled ? 'var(--highlight)' : '';
        });

        const state = createDebugState(true);
        state.setDebugMode(false);

        expect(overlayBg).toBe('');
    });

    it('multiple debug subscribers all receive the event', () => {
        const navbarCalls = [];
        const debugOrchestratorCalls = [];
        const keyboardCalls = [];

        eventBus.subscribe('app:debug-mode-changed', (v) => navbarCalls.push(v));
        eventBus.subscribe('app:debug-mode-changed', (v) => debugOrchestratorCalls.push(v));
        eventBus.subscribe('app:debug-mode-changed', (v) => keyboardCalls.push(v));

        const state = createDebugState(false);
        state.setDebugMode(true);

        expect(navbarCalls).toEqual([true]);
        expect(debugOrchestratorCalls).toEqual([true]);
        expect(keyboardCalls).toEqual([true]);
    });
});
