// Shared singleton state — imported by almost every module.
// DOM refs are gathered at module load time (type="module" is deferred).

const canvas = document.getElementById('canvas');

export const state = {
    // Canvas
    canvas,
    ctx: canvas.getContext('2d'),

    // Data (set by init)
    data: null,

    // Transform
    panX: 0,
    panY: 0,
    zoom: 1,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,

    // Bounds & LOD
    dataBounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
    levelBboxes: [],
    currentLevel: -1,
    currentLevel: -1,

    // Progressive detail
    detailPhase: 'none',       // 'none' | 'fading-in' | 'static' | 'fading-out'
    detailData: null,          // { chains, bubbles, poppedChains, totalBubbles, bpStart, bpEnd }
    detailOpacity: 0,
    skeletonOpacity: 1,
    detailSuppressed: false,   // spacebar toggle: force skeleton view while zoomed in
    physicsDebug: false,        // L-key toggle: show physics activation zone overlay

    // Hover
    hoveredChain: null,
    hoveredBubble: null,
    hoveredForceNode: null,   // popped node from force simulation
    hoveredSkeletonPl: null,  // {levelIdx, plIdx, chainId}

    // Config (from Jinja via window.__SIMPLIFY_CONFIG)
    GENOME: (window.__SIMPLIFY_CONFIG || {}).genome || '',

    // Constants
    DETAIL_CELL_THRESHOLD: 500,   // activate detail when targetCell <= this
    PHYSICS_NODE_BUDGET: 2000,    // max estimated D3 nodes for physics zone
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
        viewportBp: document.getElementById('viewport-bp'),
        cursorBp: document.getElementById('cursor-bp'),
        detailPhase: document.getElementById('detail-phase'),
        detailBar: document.getElementById('detail-bar'),
        detailChains: document.getElementById('detail-chains'),
        detailExposed: document.getElementById('detail-exposed'),
        detailNodes: document.getElementById('detail-nodes'),
        detailRange: document.getElementById('detail-range'),
        detailOpacity: document.getElementById('detail-opacity'),
        detailSteps: document.getElementById('detail-steps'),
        tooltip: document.getElementById('tooltip'),
        fetchIndicator: document.getElementById('fetch-indicator'),
    },
};
