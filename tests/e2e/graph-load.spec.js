import { test, expect } from '@playwright/test';
import {
  TEST_REGION,
  loadRegion,
  waitForNodes,
  waitForNodePositions,
  getGraphData,
  getBubbleNodes,
  getNodeCount,
} from './helpers/graph-helpers.js';

test.describe('graph loading', () => {
  test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');

    // Wait for the force-graph module to finish initialising
    await page.waitForFunction(() => typeof window._forceGraph !== 'undefined');

    // Navigate to the test region (the default auto-load targets chr5 which
    // isn't in the bundled test data, so we navigate explicitly)
    await loadRegion(page, TEST_REGION.genome, TEST_REGION.chromosome, TEST_REGION.start, TEST_REGION.end);
    await waitForNodes(page);
    await waitForNodePositions(page);

    // Expose errors so individual tests can inspect them
    page._collectedErrors = errors;
  });

  test('page loads without JS errors', async ({ page }) => {
    expect(page._collectedErrors).toHaveLength(0);
  });

  test('graph has nodes after loading a chrY region', async ({ page }) => {
    const count = await getNodeCount(page);
    expect(count).toBeGreaterThan(0);
  });

  test('graph contains at least one bubble node', async ({ page }) => {
    const bubbles = await getBubbleNodes(page);
    expect(bubbles.length).toBeGreaterThan(0);
  });

  test('graph contains bubble:end nodes', async ({ page }) => {
    // The initial view shows bubbles and their junction nodes (bubble:end).
    // Segment nodes only appear after bubbles are popped.
    const data = await getGraphData(page);
    const ends = data.nodes.filter(n => n.type === 'bubble:end');
    expect(ends.length).toBeGreaterThan(0);
  });

  test('graph has links', async ({ page }) => {
    const data = await getGraphData(page);
    expect(data.links.length).toBeGreaterThan(0);
  });

  test('pressing Go with unchanged coordinates re-renders the graph', async ({ page }) => {
    const countBefore = await getNodeCount(page);
    expect(countBefore).toBeGreaterThan(0);

    // Fire the same region again (simulates pressing Go twice)
    await loadRegion(page, TEST_REGION.genome, TEST_REGION.chromosome, TEST_REGION.start, TEST_REGION.end);
    await waitForNodes(page);

    const countAfter = await getNodeCount(page);
    expect(countAfter).toBeGreaterThan(0);
  });
});
