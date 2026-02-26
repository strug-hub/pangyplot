import { test, expect } from '@playwright/test';
import {
  TEST_REGION,
  loadRegion,
  waitForNodes,
  waitForNodePositions,
  getBubbleNodes,
  getNodeScreenPos,
  getNodeCount,
  hasNode,
} from './helpers/graph-helpers.js';

test.describe('bubble pop and undo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window._forceGraph !== 'undefined');
    await loadRegion(page, TEST_REGION.genome, TEST_REGION.chromosome, TEST_REGION.start, TEST_REGION.end);
    await waitForNodes(page);
    await waitForNodePositions(page);
  });

  test('ctrl+click a bubble expands it into internal nodes', async ({ page }) => {
    const bubbles = await getBubbleNodes(page);
    expect(bubbles.length).toBeGreaterThan(0);
    const bubble = bubbles[0];

    const countBefore = await getNodeCount(page);
    const pos = await getNodeScreenPos(page, bubble);

    // Ctrl+click the bubble to pop it
    await page.locator('#graph').focus();
    await page.mouse.click(pos.x, pos.y, { modifiers: ['Control'] });

    // Wait for the bubble node to disappear from the data model
    await page.waitForFunction(
      (id) => !window._forceGraph.graphData().nodes.some(n => n.id === id),
      bubble.id,
      { timeout: 10000 }
    );

    const countAfter = await getNodeCount(page);
    expect(countAfter).toBeGreaterThan(countBefore);
    expect(await hasNode(page, bubble.id)).toBe(false);
  });

  test('ctrl+z after a pop restores the bubble', async ({ page }) => {
    const bubbles = await getBubbleNodes(page);
    const bubble = bubbles[0];
    const countBefore = await getNodeCount(page);

    // Pop the bubble
    const pos = await getNodeScreenPos(page, bubble);
    await page.locator('#graph').focus();
    await page.mouse.click(pos.x, pos.y, { modifiers: ['Control'] });
    await page.waitForFunction(
      (id) => !window._forceGraph.graphData().nodes.some(n => n.id === id),
      bubble.id,
      { timeout: 10000 }
    );

    // Undo
    await page.locator('#graph').press('Control+z');

    // Wait for the bubble node to return
    await page.waitForFunction(
      (id) => window._forceGraph.graphData().nodes.some(n => n.id === id),
      bubble.id,
      { timeout: 10000 }
    );

    expect(await hasNode(page, bubble.id)).toBe(true);
    expect(await getNodeCount(page)).toBe(countBefore);
  });

  test('multiple pops can be undone in reverse order', async ({ page }) => {
    const bubbles = await getBubbleNodes(page);
    // Need at least 2 top-level bubbles to pop independently
    test.skip(bubbles.length < 2, 'Not enough bubbles in test region');

    const [b1, b2] = bubbles;
    const countBefore = await getNodeCount(page);

    await page.locator('#graph').focus();

    // Pop first bubble
    const pos1 = await getNodeScreenPos(page, b1);
    await page.mouse.click(pos1.x, pos1.y, { modifiers: ['Control'] });
    await page.waitForFunction(
      (id) => !window._forceGraph.graphData().nodes.some(n => n.id === id),
      b1.id,
      { timeout: 10000 }
    );

    // Pop second bubble — need fresh screen coords after layout shift
    const b2Fresh = await page.evaluate(
      (id) => {
        const n = window._forceGraph.graphData().nodes.find(n => n.id === id);
        return n ? { id: n.id, type: n.type, x: n.x, y: n.y } : null;
      },
      b2.id
    );
    test.skip(!b2Fresh, 'Second bubble no longer in graph after first pop');

    const pos2 = await getNodeScreenPos(page, b2Fresh);
    await page.mouse.click(pos2.x, pos2.y, { modifiers: ['Control'] });
    await page.waitForFunction(
      (id) => !window._forceGraph.graphData().nodes.some(n => n.id === id),
      b2.id,
      { timeout: 10000 }
    );

    // Undo second pop — b2 should return
    await page.locator('#graph').press('Control+z');
    await page.waitForFunction(
      (id) => window._forceGraph.graphData().nodes.some(n => n.id === id),
      b2.id,
      { timeout: 10000 }
    );
    expect(await hasNode(page, b2.id)).toBe(true);
    expect(await hasNode(page, b1.id)).toBe(false);

    // Undo first pop — b1 should return
    await page.locator('#graph').press('Control+z');
    await page.waitForFunction(
      (id) => window._forceGraph.graphData().nodes.some(n => n.id === id),
      b1.id,
      { timeout: 10000 }
    );
    expect(await hasNode(page, b1.id)).toBe(true);
    expect(await getNodeCount(page)).toBe(countBefore);
  });
});
