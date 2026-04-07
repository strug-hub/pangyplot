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
// Color picker event shapes
// Mirrors publishers from color-picker.js
// =============================================================================

describe('node color picker publishes color:updated', () => {
    it('emits node type with three colors', () => {
        const received = collectEvents('color:updated');

        // Simulates color-picker.js:31
        eventBus.publish('color:updated', {
            type: 'node',
            color1: '#ff0000',
            color2: '#00ff00',
            color3: '#0000ff',
        });

        expect(received).toHaveLength(1);
        expect(received[0]).toEqual({
            type: 'node',
            color1: '#ff0000',
            color2: '#00ff00',
            color3: '#0000ff',
        });
    });

    it('preset click emits same shape as manual picker', () => {
        const received = collectEvents('color:updated');

        // Simulates updateColorPickers in color-picker.js:40-41
        const colorData = { type: 'node', color1: '#111111', color2: '#222222', color3: '#333333' };
        eventBus.publish('color:updated', colorData);

        expect(received).toHaveLength(1);
        expect(received[0].type).toBe('node');
        expect(received[0].color1).toBe('#111111');
        expect(received[0].color2).toBe('#222222');
        expect(received[0].color3).toBe('#333333');
    });
});

describe('style selector publishes color:updated', () => {
    it('emits style type with style name', () => {
        const received = collectEvents('color:updated');

        // Simulates color-picker.js:57
        eventBus.publish('color:updated', { type: 'style', style: 'haplotype' });

        expect(received).toHaveLength(1);
        expect(received[0]).toEqual({ type: 'style', style: 'haplotype' });
    });
});

describe('background color picker publishes color:updated', () => {
    it('emits background type with single color', () => {
        const received = collectEvents('color:updated');

        // Simulates color-picker.js:62
        eventBus.publish('color:updated', { type: 'background', color: '#101020' });

        expect(received).toHaveLength(1);
        expect(received[0]).toEqual({ type: 'background', color: '#101020' });
    });
});

describe('link color picker publishes color:updated', () => {
    it('emits link type with single color', () => {
        const received = collectEvents('color:updated');

        // Simulates color-picker.js:66
        eventBus.publish('color:updated', { type: 'link', color: '#969696' });

        expect(received).toHaveLength(1);
        expect(received[0]).toEqual({ type: 'link', color: '#969696' });
    });
});

// =============================================================================
// Multiple color subscribers
// =============================================================================

describe('color:updated reaches all subscribers', () => {
    it('delivers to both color-manager and render-manager style subscribers', () => {
        const colorManagerCalls = [];
        const renderManagerCalls = [];

        // Simulate color-manager subscriber
        eventBus.subscribe('color:updated', (data) => {
            colorManagerCalls.push(data);
        });

        // Simulate render-manager subscriber
        eventBus.subscribe('color:updated', (data) => {
            renderManagerCalls.push(data);
        });

        eventBus.publish('color:updated', { type: 'style', style: 'depth' });

        expect(colorManagerCalls).toHaveLength(1);
        expect(renderManagerCalls).toHaveLength(1);
        expect(colorManagerCalls[0]).toEqual(renderManagerCalls[0]);
    });

    it('color:updated does not leak to coordinate events', () => {
        const coordEvents = collectEvents('ui:coordinates-changed');

        eventBus.publish('color:updated', { type: 'node', color1: '#fff', color2: '#000', color3: '#888' });

        expect(coordEvents).toHaveLength(0);
    });
});
