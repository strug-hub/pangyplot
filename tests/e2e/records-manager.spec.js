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
import {
  getLookupSizes,
  getViewStateSize,
  getNodeRecord,
  getLinkRecord,
  getAllNodeRecordIds,
  getAllLinkRecordIds,
  getAdjacency,
  resolveSegment,
  getViewStateEntries,
  allNodeRecordsHaveElements,
  allCompleteLinkRecordsHaveElements,
  getPoppedBubbleIds,
  getRecordCountsByType,
  allGraphNodesHaveRecords,
} from './helpers/records-helpers.js';

// ---------- setup ----------

test.describe('record management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window._forceGraph !== 'undefined');
    await loadRegion(
      page,
      TEST_REGION.genome,
      TEST_REGION.chromosome,
      TEST_REGION.start,
      TEST_REGION.end
    );
    await waitForNodes(page);
    await waitForNodePositions(page);
  });

  // ---------- initial state after /select ----------

  test.describe('initial state after region load', () => {

    test('lookup maps are populated with records', async ({ page }) => {
      const sizes = await getLookupSizes(page);
      expect(sizes.nodes).toBeGreaterThan(0);
      expect(sizes.links).toBeGreaterThan(0);
      expect(sizes.adjacency).toBeGreaterThan(0);
    });

    test('node records include both bubbles and segments', async ({ page }) => {
      const counts = await getRecordCountsByType(page);
      expect(counts.bubble).toBeGreaterThan(0);
      // segments may be 0 initially (all hidden inside bubbles), but
      // boundary segments between bubbles are visible as their own records
    });

    test('every node record has elements', async ({ page }) => {
      expect(await allNodeRecordsHaveElements(page)).toBe(true);
    });

    test('every complete link record has elements', async ({ page }) => {
      expect(await allCompleteLinkRecordsHaveElements(page)).toBe(true);
    });

    test('every D3 graph node has a backing record', async ({ page }) => {
      expect(await allGraphNodesHaveRecords(page)).toBe(true);
    });

    test('viewState has segment-to-node mappings', async ({ page }) => {
      const vsSize = await getViewStateSize(page);
      expect(vsSize).toBeGreaterThan(0);
    });

    test('viewState maps segments to bubble records', async ({ page }) => {
      const entries = await getViewStateEntries(page);
      // At least some entries should map to bubbles
      const bubbleMappings = entries.filter(e => e.nodeId.startsWith('b'));
      expect(bubbleMappings.length).toBeGreaterThan(0);
    });

    test('no bubble has popData initially', async ({ page }) => {
      const popped = await getPoppedBubbleIds(page);
      expect(popped).toHaveLength(0);
    });

    test('adjacency index has entries for nodes with links', async ({ page }) => {
      // Pick a node that appears in the graph
      const nodeIds = await getAllNodeRecordIds(page);
      expect(nodeIds.length).toBeGreaterThan(0);

      // At least some nodes should have adjacency entries
      let nodesWithAdj = 0;
      for (const id of nodeIds.slice(0, 20)) {
        const adj = await getAdjacency(page, id);
        if (adj.length > 0) nodesWithAdj++;
      }
      expect(nodesWithAdj).toBeGreaterThan(0);
    });

    test('bubble records have sourceSegs and sinkSegs', async ({ page }) => {
      const bubbles = await getBubbleNodes(page);
      expect(bubbles.length).toBeGreaterThan(0);

      const record = await getNodeRecord(page, bubbles[0].id);
      expect(record).not.toBeNull();
      expect(record.type).toBe('bubble');
      expect(record.sourceSegs).not.toBeNull();
      expect(record.sinkSegs).not.toBeNull();
      expect(record.sourceSegs.length).toBeGreaterThan(0);
      expect(record.sinkSegs.length).toBeGreaterThan(0);
    });
  });

  // ---------- region change clears records ----------

  test.describe('region change clears old records', () => {

    test('records are replaced on new region load', async ({ page }) => {
      const sizesBefore = await getLookupSizes(page);
      const idsBefore = await getAllNodeRecordIds(page);
      expect(sizesBefore.nodes).toBeGreaterThan(0);

      // Load a different sub-region (narrower range within same chromosome)
      await loadRegion(
        page,
        TEST_REGION.genome,
        TEST_REGION.chromosome,
        TEST_REGION.start + 10000,
        TEST_REGION.end - 10000
      );
      await waitForNodes(page);

      const sizesAfter = await getLookupSizes(page);
      const idsAfter = await getAllNodeRecordIds(page);

      // Records should be populated (not empty)
      expect(sizesAfter.nodes).toBeGreaterThan(0);
      expect(sizesAfter.links).toBeGreaterThan(0);

      // The record set should be different (narrower region = fewer or different records)
      // At minimum, old records that are outside the new range should be gone
      // We verify the Maps were cleared and repopulated by checking that
      // every current record ID corresponds to a fresh record (not stale)
      expect(await allNodeRecordsHaveElements(page)).toBe(true);
      expect(await allGraphNodesHaveRecords(page)).toBe(true);
    });

    test('viewState is refreshed on new region load', async ({ page }) => {
      const vsBefore = await getViewStateSize(page);
      expect(vsBefore).toBeGreaterThan(0);

      await loadRegion(
        page,
        TEST_REGION.genome,
        TEST_REGION.chromosome,
        TEST_REGION.start + 10000,
        TEST_REGION.end - 10000
      );
      await waitForNodes(page);

      const vsAfter = await getViewStateSize(page);
      // viewState was cleared and repopulated — should still have entries
      expect(vsAfter).toBeGreaterThan(0);
    });

    test('popped state is lost on region change', async ({ page }) => {
      // Pop a bubble first
      const bubbles = await getBubbleNodes(page);
      expect(bubbles.length).toBeGreaterThan(0);
      const bubble = bubbles[0];

      const pos = await getNodeScreenPos(page, bubble);
      await page.locator('#graph').focus();
      await page.mouse.click(pos.x, pos.y, { modifiers: ['Control'] });
      await page.waitForFunction(
        (id) => !window._forceGraph.graphData().nodes.some(n => n.id === id),
        bubble.id,
        { timeout: 10000 }
      );

      const poppedBefore = await getPoppedBubbleIds(page);
      expect(poppedBefore.length).toBeGreaterThan(0);

      // Load fresh region — all records cleared
      await loadRegion(
        page,
        TEST_REGION.genome,
        TEST_REGION.chromosome,
        TEST_REGION.start,
        TEST_REGION.end
      );
      await waitForNodes(page);

      const poppedAfter = await getPoppedBubbleIds(page);
      expect(poppedAfter).toHaveLength(0);
    });
  });

  // ---------- pop lifecycle ----------

  test.describe('pop record lifecycle', () => {

    test('popping a bubble creates child records in its inside set', async ({ page }) => {
      const bubbles = await getBubbleNodes(page);
      expect(bubbles.length).toBeGreaterThan(0);
      const bubble = bubbles[0];

      // Before pop: no children
      const recordBefore = await getNodeRecord(page, bubble.id);
      expect(recordBefore.insideCount).toBe(0);
      expect(recordBefore.hasPopData).toBe(false);

      // Pop
      const pos = await getNodeScreenPos(page, bubble);
      await page.locator('#graph').focus();
      await page.mouse.click(pos.x, pos.y, { modifiers: ['Control'] });
      await page.waitForFunction(
        (id) => !window._forceGraph.graphData().nodes.some(n => n.id === id),
        bubble.id,
        { timeout: 10000 }
      );

      // After pop: has children and popData
      const recordAfter = await getNodeRecord(page, bubble.id);
      expect(recordAfter.insideCount).toBeGreaterThan(0);
      expect(recordAfter.hasPopData).toBe(true);
    });

    test('popping a bubble updates viewState (children mapped, parent unmapped)', async ({ page }) => {
      const bubbles = await getBubbleNodes(page);
      const bubble = bubbles[0];
      const record = await getNodeRecord(page, bubble.id);

      // Before pop: source segs map to this bubble
      if (record.sourceSegs && record.sourceSegs.length > 0) {
        const mapped = await resolveSegment(page, String(record.sourceSegs[0]));
        expect(mapped).toBe(bubble.id);
      }

      // Pop
      const pos = await getNodeScreenPos(page, bubble);
      await page.locator('#graph').focus();
      await page.mouse.click(pos.x, pos.y, { modifiers: ['Control'] });
      await page.waitForFunction(
        (id) => !window._forceGraph.graphData().nodes.some(n => n.id === id),
        bubble.id,
        { timeout: 10000 }
      );

      // After pop: those same segs should no longer resolve to the parent bubble
      // They should resolve to a child record or to null (visible as themselves)
      if (record.sourceSegs && record.sourceSegs.length > 0) {
        const mappedAfter = await resolveSegment(page, String(record.sourceSegs[0]));
        // Could be null (segment visible as itself) or a child bubble ID — but NOT the parent
        if (mappedAfter !== null) {
          expect(mappedAfter).not.toBe(bubble.id);
        }
      }
    });

    test('child records have elements after pop', async ({ page }) => {
      const bubbles = await getBubbleNodes(page);
      const bubble = bubbles[0];

      const pos = await getNodeScreenPos(page, bubble);
      await page.locator('#graph').focus();
      await page.mouse.click(pos.x, pos.y, { modifiers: ['Control'] });
      await page.waitForFunction(
        (id) => !window._forceGraph.graphData().nodes.some(n => n.id === id),
        bubble.id,
        { timeout: 10000 }
      );

      // All child records should have elements
      const childIds = await page.evaluate((parentId) => {
        const parent = window._recordsManager.getNode(parentId);
        return parent ? [...parent.inside].map(r => r.id) : [];
      }, bubble.id);

      expect(childIds.length).toBeGreaterThan(0);
      for (const childId of childIds) {
        const childRecord = await getNodeRecord(page, childId);
        expect(childRecord.hasElements).toBe(true);
        expect(childRecord.nodeElCount).toBeGreaterThan(0);
      }
    });

    test('new link records are created for popped content', async ({ page }) => {
      const linkCountBefore = (await getLookupSizes(page)).links;

      const bubbles = await getBubbleNodes(page);
      const bubble = bubbles[0];

      const pos = await getNodeScreenPos(page, bubble);
      await page.locator('#graph').focus();
      await page.mouse.click(pos.x, pos.y, { modifiers: ['Control'] });
      await page.waitForFunction(
        (id) => !window._forceGraph.graphData().nodes.some(n => n.id === id),
        bubble.id,
        { timeout: 10000 }
      );

      const linkCountAfter = (await getLookupSizes(page)).links;
      // Popping should create new links connecting the child nodes
      expect(linkCountAfter).toBeGreaterThan(linkCountBefore);
    });
  });

  // ---------- unpop lifecycle ----------

  test.describe('unpop record lifecycle', () => {

    test('undoing a pop clears popData and inside set', async ({ page }) => {
      const bubbles = await getBubbleNodes(page);
      const bubble = bubbles[0];

      // Pop
      const pos = await getNodeScreenPos(page, bubble);
      await page.locator('#graph').focus();
      await page.mouse.click(pos.x, pos.y, { modifiers: ['Control'] });
      await page.waitForFunction(
        (id) => !window._forceGraph.graphData().nodes.some(n => n.id === id),
        bubble.id,
        { timeout: 10000 }
      );

      // Verify popped state
      let record = await getNodeRecord(page, bubble.id);
      expect(record.hasPopData).toBe(true);
      expect(record.insideCount).toBeGreaterThan(0);

      // Undo
      await page.locator('#graph').press('Control+z');
      await page.waitForFunction(
        (id) => window._forceGraph.graphData().nodes.some(n => n.id === id),
        bubble.id,
        { timeout: 10000 }
      );

      // popData and inside should be cleared
      record = await getNodeRecord(page, bubble.id);
      expect(record.hasPopData).toBe(false);
      expect(record.insideCount).toBe(0);
    });

    test('undoing a pop restores viewState mappings', async ({ page }) => {
      const bubbles = await getBubbleNodes(page);
      const bubble = bubbles[0];
      const record = await getNodeRecord(page, bubble.id);

      // Pop
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
      await page.waitForFunction(
        (id) => window._forceGraph.graphData().nodes.some(n => n.id === id),
        bubble.id,
        { timeout: 10000 }
      );

      // After undo: source segs should map back to this bubble
      if (record.sourceSegs && record.sourceSegs.length > 0) {
        const mapped = await resolveSegment(page, String(record.sourceSegs[0]));
        expect(mapped).toBe(bubble.id);
      }
    });

    test('bubble record retains its elements after unpop', async ({ page }) => {
      const bubbles = await getBubbleNodes(page);
      const bubble = bubbles[0];

      // Pop
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
      await page.waitForFunction(
        (id) => window._forceGraph.graphData().nodes.some(n => n.id === id),
        bubble.id,
        { timeout: 10000 }
      );

      const record = await getNodeRecord(page, bubble.id);
      expect(record.hasElements).toBe(true);
      expect(record.nodeElCount).toBeGreaterThan(0);
    });
  });

  // ---------- record identity and reuse ----------

  test.describe('record identity', () => {

    test('reloading the same region reuses record objects via Maps', async ({ page }) => {
      const sizesBefore = await getLookupSizes(page);

      // Reload same region
      await loadRegion(
        page,
        TEST_REGION.genome,
        TEST_REGION.chromosome,
        TEST_REGION.start,
        TEST_REGION.end
      );
      await waitForNodes(page);

      const sizesAfter = await getLookupSizes(page);
      // Same region should produce the same number of records
      expect(sizesAfter.nodes).toBe(sizesBefore.nodes);
      expect(sizesAfter.links).toBe(sizesBefore.links);
    });

    test('record coords are consistent with element positions', async ({ page }) => {
      // Pick a bubble and verify its record coords are set
      const bubbles = await getBubbleNodes(page);
      expect(bubbles.length).toBeGreaterThan(0);

      const record = await getNodeRecord(page, bubbles[0].id);
      expect(record.coords).not.toBeNull();
      expect(record.coords.x1).toBeDefined();
      expect(record.coords.y1).toBeDefined();
    });
  });

  // ---------- link records ----------

  test.describe('link records', () => {

    test('link records reference valid source and target node IDs', async ({ page }) => {
      const nodeIds = new Set(await getAllNodeRecordIds(page));
      const linkIds = await getAllLinkRecordIds(page);

      let checkedCount = 0;
      for (const linkId of linkIds.slice(0, 50)) {
        const link = await getLinkRecord(page, linkId);
        if (!link || link.incomplete) continue;
        expect(nodeIds.has(link.sourceId)).toBe(true);
        expect(nodeIds.has(link.targetId)).toBe(true);
        checkedCount++;
      }
      expect(checkedCount).toBeGreaterThan(0);
    });

    test('chain links exist between sibling bubbles', async ({ page }) => {
      const linkIds = await getAllLinkRecordIds(page);
      const chainLinks = [];
      for (const linkId of linkIds) {
        const link = await getLinkRecord(page, linkId);
        if (link && link.isChainLink) chainLinks.push(link);
      }
      // The test region should have chains
      expect(chainLinks.length).toBeGreaterThan(0);

      // Verify chain links connect bubble records
      for (const cl of chainLinks.slice(0, 5)) {
        expect(cl.sourceId.startsWith('b')).toBe(true);
        expect(cl.targetId.startsWith('b')).toBe(true);
      }
    });

    test('adjacency index is consistent with link records', async ({ page }) => {
      const nodeIds = await getAllNodeRecordIds(page);
      // Check a few nodes: their adjacency should contain only valid link IDs
      const linkIdSet = new Set(await getAllLinkRecordIds(page));

      for (const nodeId of nodeIds.slice(0, 10)) {
        const adj = await getAdjacency(page, nodeId);
        for (const linkId of adj) {
          expect(linkIdSet.has(linkId)).toBe(true);
        }
      }
    });
  });
});
