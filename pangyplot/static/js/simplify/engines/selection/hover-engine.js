// Cursor coordinate readout + hover hit-test for chains, bubbles, force nodes, skeleton.

import { state } from '../../simplify-state.js';
import { scheduleFrame } from '../../render-manager.js';
import { xToBp, getChromosome, isReady } from '../../data/spine.js';
import { formatBp } from '../../utils/format-utils.js';
import { hitTestForceNodes, hitTestBubbles, hitTestChains, formatForceNodeTooltip, formatTooltip, formatBubbleTooltip } from '../../utils/hit-test.js';
import { hitTestSkeleton, formatSkeletonTooltip } from '../../skeleton/engines/skeleton-hit-test.js';
import { updateCursorBp, showTooltip, hideTooltip } from '../../ui/status-bar.js';

export function setupHover(canvas) {
    canvas.addEventListener('mousemove', e => {
        if (state.isDragging || state.selectionBox || !isReady()) return;
        const rect = canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const layoutX = (screenX - state.panX) / state.zoom;
        const layoutY = (screenY - state.panY) / state.zoom;
        const bp = xToBp(layoutX);
        const chr = getChromosome();
        if (bp !== null && chr) {
            updateCursorBp(`${chr}:${formatBp(bp)}`);
        }

        // Hit-test priority: force nodes > bubbles > chains > skeleton polylines
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

            let html;
            if (hitForceNode) html = formatForceNodeTooltip(hitForceNode);
            else if (hitBubble) html = formatBubbleTooltip(hitBubble);
            else if (hitChain) html = formatTooltip(hitChain);
            else html = formatSkeletonTooltip(hitSkel);

            showTooltip(html, e.clientX, e.clientY);
            canvas.style.cursor = 'crosshair';
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
    });

    canvas.addEventListener('mouseleave', () => {
        updateCursorBp('');
        if (state.hoveredChain || state.hoveredBubble || state.hoveredForceNode || state.hoveredSkeletonPl) {
            state.hoveredChain = null;
            state.hoveredBubble = null;
            state.hoveredForceNode = null;
            state.hoveredSkeletonPl = null;
            hideTooltip();
            canvas.style.cursor = 'grab';
            scheduleFrame();
        }
    });
}
