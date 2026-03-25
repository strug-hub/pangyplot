// Cursor coordinate readout + hover hit-test for chains, bubbles, force nodes, skeleton.
// Also handles click-to-select for individual nodes.

import { state } from '../../simplify-state.js';
import { scheduleFrame } from '../../utils/frame-scheduler.js';
import { layoutToBp, isReady } from '../reference-spine-engine.js';
import { formatBp, formatPercentage } from '@format-utils';
import { hitTestChains, getChainTooltip, hitTestBubbleCircles, getBubbleCircleTooltip } from '../../detail/engines/polychain/polychain-hover-engine.js';
import { hitTestForceNodes, hitTestBubbles, getForceNodeTooltip, getBubbleTooltip } from '../../detail/engines/node-hover-engine.js';
import { hitTestSkeleton, getSkeletonTooltip } from '../../skeleton/engines/skeleton-hover-engine.js';
import { formatTooltipHtml } from '../../ui/tooltip-formatter.js';
import { updateCursorBp, showTooltip, hideTooltip } from '../../ui/status-bar.js';
import { updateSelectionInfo } from '@ui/sections/tabs/information-panel.js';
import { formatNodeLabel } from '@format-utils';

export function setupHover(canvas) {
    canvas.addEventListener('mousemove', e => {
        state._lastMouseX = e.clientX;
        state._lastMouseY = e.clientY;
        if (state.isDragging || state.selectionBox || !isReady()) return;
        const rect = canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const layoutX = (screenX - state.panX) / state.zoom;
        const layoutY = (screenY - state.panY) / state.zoom;
        const bp = layoutToBp(layoutX, layoutY);
        const chr = state.chromosome;
        if (bp !== null && chr) {
            updateCursorBp(`${chr}:${formatBp(bp)}`);
        }

        const ctrlHeld = e.ctrlKey || e.metaKey;

        if (ctrlHeld) {
            // --- Bubble browsing mode ---
            // Clear chain-mode hover state
            state.hoveredForceNode = null;
            state.hoveredBubble = null;
            state.hoveredChain = null;
            state.hoveredSkeletonPl = null;

            const hit = hitTestBubbleCircles(layoutX, layoutY);
            state.hoveredBubbleCircle = hit;

            if (hit) {
                showTooltip(formatTooltipHtml(getBubbleCircleTooltip(hit)), e.clientX, e.clientY);
                canvas.style.cursor = 'default';
            } else {
                hideTooltip();
                canvas.style.cursor = 'grab';
            }
            scheduleFrame();
        } else {
            // --- Chain browsing mode (default) ---
            state.hoveredBubbleCircle = null;

            const hitForceNode = hitTestForceNodes(layoutX, layoutY);
            const hitBubble = hitForceNode ? null : hitTestBubbles(layoutX, layoutY);
            const hitChain = (hitForceNode || hitBubble) ? null : hitTestChains(layoutX, layoutY);
            const hitSkel = (hitForceNode || hitBubble || hitChain) ? null : hitTestSkeleton(layoutX, layoutY);
            const hit = hitForceNode || hitBubble || hitChain || hitSkel;

            if (hit) {
                state.hoveredForceNode = hitForceNode;
                state.hoveredBubble = hitBubble;
                state.hoveredChain = hitChain;
                state.hoveredSkeletonPl = hitSkel;

                let data;
                if (hitForceNode) data = getForceNodeTooltip(hitForceNode);
                else if (hitBubble) data = getBubbleTooltip(hitBubble);
                else if (hitChain) data = getChainTooltip(hitChain);
                else data = getSkeletonTooltip(hitSkel);

                showTooltip(formatTooltipHtml(data), e.clientX, e.clientY);
                canvas.style.cursor = 'default';
                scheduleFrame();
            } else if (state.hoveredChain || state.hoveredBubble || state.hoveredForceNode || state.hoveredSkeletonPl) {
                state.hoveredChain = null;
                state.hoveredBubble = null;
                state.hoveredForceNode = null;
                state.hoveredSkeletonPl = null;
                hideTooltip();
                canvas.style.cursor = 'grab';
                scheduleFrame();
            }
        }
    });

    // --- Click-to-select: pick the currently hovered node ---
    // Track drag state across mousedown→mouseup→click to suppress click-after-pan
    let mouseDownPos = null;
    const DRAG_THRESHOLD = 4; // pixels — below this counts as a click, not a drag

    canvas.addEventListener('mousedown', e => {
        if (e.button === 0) mouseDownPos = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener('click', e => {
        // Don't intercept ctrl/meta (pop/unpop) or shift (rectangle select)
        if (e.ctrlKey || e.metaKey || e.shiftKey) return;

        // Suppress click if mouse moved significantly (was a pan/drag)
        if (mouseDownPos) {
            const dx = e.clientX - mouseDownPos.x;
            const dy = e.clientY - mouseDownPos.y;
            if (dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) {
                mouseDownPos = null;
                return;
            }
        }
        mouseDownPos = null;

        const hit = state.hoveredForceNode || state.hoveredBubble;
        if (hit) {
            state.selectedNode = hit;
            showNodeInfo(hit);
            scheduleFrame();
        } else if (state.selectedNode) {
            state.selectedNode = null;
            updateSelectionInfo(null);
            scheduleFrame();
        }
    });

    canvas.addEventListener('mouseleave', () => {
        updateCursorBp('');
        state.hoveredChain = null;
        state.hoveredBubble = null;
        state.hoveredForceNode = null;
        state.hoveredSkeletonPl = null;
        state.hoveredBubbleCircle = null;
        hideTooltip();
        canvas.style.cursor = 'grab';
        scheduleFrame();
    });
}

function formatCoordinates(ranges) {
    if (!ranges || ranges.length === 0) return null;
    const allStarts = ranges.map(r => r[0]);
    const allEnds = ranges.map(r => r[1]);
    const start = Math.min(...allStarts);
    const end = Math.max(...allEnds);
    const genome = state.GENOME || '';
    const chr = state.chromosome || '';
    return `${genome}#${chr}:${start.toLocaleString()}-${end.toLocaleString()}`;
}


function showNodeInfo(node) {
    const record = node.record;
    if (!record) { updateSelectionInfo(null); return; }

    const rawId = node.id.slice(1).split(':')[0];

    const base = {
        id: formatNodeLabel(node.id) || '',
        rawId,
        type: record.type,
        coordinates: formatCoordinates(record.ranges),
        length: record.seqLength,
        gcPercent: formatPercentage(record.gcCount, record.seqLength),
        nCount: record.nCount,
    };

    if (record.type === 'segment') {
        updateSelectionInfo({ ...base, seq: record.seq || '' });
    } else if (record.type === 'bubble') {
        updateSelectionInfo({
            ...base,
            subtype: record.subtype,
            chain: record.chain,
            chainStep: record.chainStep,
            size: record.size,
            parent: record.parent,
            siblings: record.siblings,
        });
    } else {
        updateSelectionInfo(base);
    }

    // Switch to Graph Information tab
    const btn = document.getElementById('graph-info-button');
    if (btn) btn.click();
}
