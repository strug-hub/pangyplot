// Test region available in the bundled hprc.clip datastore
export const TEST_REGION = {
  genome: 'GRCh38',
  chromosome: 'chrY',
  start: 19693650,
  end: 19754942,
};

/** Publish ui:construct-graph to navigate to a genomic region */
export async function loadRegion(page, genome, chromosome, start, end) {
  await page.evaluate(
    ({ genome, chromosome, start, end }) => {
      window._eventBus.publish('ui:construct-graph', { genome, chromosome, start, end });
    },
    { genome, chromosome, start, end }
  );
}

/** Wait until the graph has at least minCount nodes */
export async function waitForNodes(page, minCount = 1, timeout = 15000) {
  await page.waitForFunction(
    (min) => (window._forceGraph?.graphData()?.nodes?.length ?? 0) >= min,
    minCount,
    { timeout }
  );
}

/** Return the full { nodes, links } graph data */
export async function getGraphData(page) {
  return page.evaluate(() => {
    const { nodes, links } = window._forceGraph.graphData();
    // Return plain objects so Playwright can serialize them
    return {
      nodes: nodes.map(n => ({ id: n.id, type: n.type, x: n.x, y: n.y })),
      links: links.map(l => ({ id: l.id })),
    };
  });
}

/** Return all nodes of type 'bubble' */
export async function getBubbleNodes(page) {
  return page.evaluate(() =>
    window._forceGraph
      .graphData()
      .nodes.filter(n => n.type === 'bubble')
      .map(n => ({ id: n.id, type: n.type, x: n.x, y: n.y }))
  );
}

/**
 * Convert a graph-space node position to page-absolute pixels.
 * graph2ScreenCoords returns coords relative to the canvas; we add the
 * canvas's position in the viewport so page.mouse.click lands correctly.
 */
export async function getNodeScreenPos(page, node) {
  return page.evaluate(({ x, y }) => {
    const graphPos = window._forceGraph.graph2ScreenCoords(x, y);
    const rect = document.querySelector('#graph-container canvas').getBoundingClientRect();
    return { x: graphPos.x + rect.left, y: graphPos.y + rect.top };
  }, { x: node.x, y: node.y });
}

/**
 * Wait until all nodes have finite x/y positions assigned by the force
 * simulation (warmupTicks may not have run yet when waitForNodes resolves).
 */
export async function waitForNodePositions(page, timeout = 10000) {
  await page.waitForFunction(
    () => {
      const nodes = window._forceGraph?.graphData()?.nodes ?? [];
      return (
        nodes.length > 0 &&
        nodes.every(
          n => typeof n.x === 'number' && isFinite(n.x) &&
               typeof n.y === 'number' && isFinite(n.y)
        )
      );
    },
    { timeout }
  );
}

/**
 * Return a Promise that resolves with the event data the next time
 * _eventBus fires eventName. Must be set up BEFORE the action that
 * triggers the event.
 */
export function waitForGraphEvent(page, eventName) {
  return page.evaluate(
    (name) =>
      new Promise((resolve) => {
        const unsub = window._eventBus.subscribe(name, (data) => {
          resolve(data);
        });
      }),
    eventName
  );
}

/** Total node count in the current graph */
export async function getNodeCount(page) {
  return page.evaluate(() => window._forceGraph.graphData().nodes.length);
}

/** Check whether a node with the given id is currently in the graph */
export async function hasNode(page, nodeId) {
  return page.evaluate(
    (id) => window._forceGraph.graphData().nodes.some(n => n.id === id),
    nodeId
  );
}
