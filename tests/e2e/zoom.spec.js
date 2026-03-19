import { test, expect } from '@playwright/test';
import {
  TEST_REGION,
  loadRegion,
  waitForNodes,
  waitForNodePositions,
} from './helpers/graph-helpers.js';

test.describe('zoom', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window._forceGraph !== 'undefined');
    await loadRegion(page, TEST_REGION.genome, TEST_REGION.chromosome, TEST_REGION.start, TEST_REGION.end);
    await waitForNodes(page);
    await waitForNodePositions(page);
  });

  async function focusCanvas(page) {
    const box = await page.locator('#graph-container canvas').boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.locator('#graph').focus();
    return { x: cx, y: cy };
  }

  test('scroll zooms in', async ({ page }) => {
    const zoomBefore = await page.evaluate(() => window._forceGraph.getZoomFactor());

    await focusCanvas(page);

    await page.mouse.wheel(0, -300);

    const zoomAfter = await page.evaluate(() => window._forceGraph.getZoomFactor());
    expect(zoomAfter).toBeGreaterThan(zoomBefore);
  });

  test('scroll zooms out', async ({ page }) => {
    const zoomBefore = await page.evaluate(() => window._forceGraph.getZoomFactor());

    await focusCanvas(page);

    await page.mouse.wheel(0, 300);

    const zoomAfter = await page.evaluate(() => window._forceGraph.getZoomFactor());
    expect(zoomAfter).toBeLessThan(zoomBefore);
  });

  test('pinch gesture (wheel + ctrlKey) zooms the graph', async ({ page }) => {
    // On macOS, trackpad pinch-to-zoom fires wheel events with ctrlKey: true.
    // This is the natural zoom gesture and should work without holding Shift.
    // Regression test for: "Zooming does not work - Chrome 144, MacOS 15.7.3" (#17)
    const zoomBefore = await page.evaluate(() => window._forceGraph.getZoomFactor());

    await focusCanvas(page);

    await page.locator('#graph-container canvas').dispatchEvent('wheel', {
      deltaY: -150,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });

    const zoomAfter = await page.evaluate(() => window._forceGraph.getZoomFactor());
    expect(zoomAfter).not.toBe(zoomBefore);
  });
});
