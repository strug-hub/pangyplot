// Shared singleton state — imported by almost every module.
// DOM refs are gathered at module load time (type="module" is deferred).

const canvas = document.getElementById('canvas');

export const state = {
    // Canvas
    canvas,
    ctx: canvas.getContext('2d'),

    // Stats (set by skeleton fetcher)
    stats: null,
    chromosome: '',

    // Transform
    panX: 0,
    panY: 0,
    zoom: 1,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,

    // LOD
    currentLOD: -1,

    // Progressive detail
    detailPhase: 'none',       // 'none' | 'fading-in' | 'static' | 'fading-out'
    detailData: null,          // { chains, bubbles, poppedChains, totalBubbles, bpStart, bpEnd }
    detailOpacity: 0,
    skeletonOpacity: 1,
    isFetching: false,         // true while a detail fetch is in-flight
    detailSuppressed: false,   // spacebar toggle: force skeleton view while zoomed in
    physicsDebug: false,        // L-key toggle: show physics activation zone overlay
    forceVectors: false,        // Y-key toggle: show per-node force vectors
    forceVectorMode: 'all',    // U-key cycle: 'all', 'charge', 'intra', 'link', 'layout', 'linkRepul'

    // Force simulation
    activeSeedChainId: null,   // chain ID auto-popped as force graph (seed)
    poppedChainIds: new Set(),  // all chain IDs currently rendered as force graph

    // Selection (Shift+drag rectangle)
    selectedChains: new Map(),   // Map<chain, { tStart, tEnd }> — clipped arc-length fraction
    selectionBox: null,          // { startX, startY, endX, endY } in screen coords, or null

    // Hover
    hoveredChain: null,
    hoveredBubble: null,
    hoveredBubbleCircle: null,  // { x, y, meta, chainId } — ctrl+hover bubble browsing
    hoveredForceNode: null,   // popped node from force simulation
    hoveredSkeletonPl: null,  // {plIdx, chainId}

    // Node selection (click-to-select)
    selectedNode: null,       // force node or bubble currently selected

    // Core viewer embed
    coreViewerActive: false,  // true when core graph canvas is swapped in

    // Config (from Jinja via window.__APP_CONFIG)
    GENOME: (window.__APP_CONFIG || {}).genome || '',

    // Constants
    DETAIL_GRID_THRESHOLD: 500,   // activate detail when targetGridSize <= this
    DETAIL_EXIT_THRESHOLD: 700,   // exit detail when targetGridSize > this (hysteresis)
    BUBBLE_CIRCLE_GRID_THRESHOLD: 400,  // outer gate; per-bubble threshold scales with bp length
    PHYSICS_NODE_BUDGET: 1500,    // max estimated D3 nodes for physics zone
    FETCH_MARGIN: 0.2,
    FADE_DURATION: 600,

    // DOM element references
    dom: {
        levelLabel: document.getElementById('level-label'),
        nodeCount: document.getElementById('node-count'),
        polylineCount: document.getElementById('polyline-count'),
        visibleCount: document.getElementById('visible-count'),
        reduction: document.getElementById('reduction'),
        stats: document.getElementById('stats'),
        loading: document.getElementById('loading'),
        gridMeter: document.getElementById('grid-meter'),
        zoomVal: document.getElementById('zoom-val'),
        gridVal: document.getElementById('grid-val'),
        viewportBp: document.getElementById('viewport-bp'),
        cursorBp: document.getElementById('cursor-bp'),
        detailPhase: document.getElementById('detail-phase'),
        detailBar: document.getElementById('detail-bar'),
        detailChains: document.getElementById('detail-chains'),
        detailExposed: document.getElementById('detail-exposed'),
        detailNodes: document.getElementById('detail-nodes'),
        detailJNodes: document.getElementById('detail-jnodes'),
        detailJLinks: document.getElementById('detail-jlinks'),
        detailForceNodes: document.getElementById('detail-force-nodes'),
        detailRange: document.getElementById('detail-range'),
        detailOpacity: document.getElementById('detail-opacity'),
        detailSteps: document.getElementById('detail-steps'),
        detailFetchMs: document.getElementById('detail-fetch-ms'),
        tooltip: document.getElementById('tooltip'),
        fetchIndicator: document.getElementById('fetch-indicator'),
    },
};

window.__ss = state;  // debug access