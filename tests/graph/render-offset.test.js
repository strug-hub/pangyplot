import { describe, it, expect, beforeEach } from 'vitest';
import { setRenderOffset, rx, ry } from '@graph/render/render-offset.js';

describe('render-offset', () => {
    beforeEach(() => {
        setRenderOffset(0, 0);
    });

    it('rx/ry return identity when offset is zero', () => {
        expect(rx(100)).toBe(100);
        expect(ry(200)).toBe(200);
    });

    it('rx subtracts the x offset', () => {
        setRenderOffset(1000, 0);
        expect(rx(1050)).toBe(50);
        expect(rx(1000)).toBe(0);
        expect(rx(900)).toBe(-100);
    });

    it('ry subtracts the y offset', () => {
        setRenderOffset(0, 500);
        expect(ry(520)).toBe(20);
        expect(ry(500)).toBe(0);
        expect(ry(480)).toBe(-20);
    });

    it('handles both offsets simultaneously', () => {
        setRenderOffset(1000, 2000);
        expect(rx(1005)).toBe(5);
        expect(ry(2010)).toBe(10);
    });

    it('preserves screen position equivalence', () => {
        // Simulates the real scenario: panX, panY, zoom define the view,
        // and the render offset is viewport top-left in world coords.
        const panX = -5000000;
        const panY = -3000000;
        const zoom = 50000;

        const worldX = 100.0002;
        const worldY = 60.0003;

        // Original screen position (what the canvas would compute)
        const screenX = worldX * zoom + panX;
        const screenY = worldY * zoom + panY;

        // With render offset
        const ox = -panX / zoom;
        const oy = -panY / zoom;
        setRenderOffset(ox, oy);

        // Render-space coords times zoom should give the same screen position
        const renderScreenX = rx(worldX) * zoom;
        const renderScreenY = ry(worldY) * zoom;

        expect(renderScreenX).toBeCloseTo(screenX, 6);
        expect(renderScreenY).toBeCloseTo(screenY, 6);
    });

    it('keeps render-space values small for visible content', () => {
        // Viewport top-left at world (100000, 50000), viewport ~20 units wide
        setRenderOffset(100000, 50000);

        // A point at the center of the viewport
        const renderX = rx(100010);
        const renderY = ry(50010);

        expect(renderX).toBe(10);
        expect(renderY).toBe(10);
        // These small values avoid 32-bit float precision issues in canvas
    });

    it('negative world coordinates work correctly', () => {
        setRenderOffset(-500, -300);
        expect(rx(-490)).toBe(10);
        expect(ry(-295)).toBe(5);
    });

    it('offset can be updated between frames', () => {
        setRenderOffset(100, 200);
        expect(rx(110)).toBe(10);

        setRenderOffset(200, 300);
        expect(rx(210)).toBe(10);
        expect(ry(310)).toBe(10);
    });
});
