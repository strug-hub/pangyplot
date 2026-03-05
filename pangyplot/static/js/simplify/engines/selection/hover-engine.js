// Cursor coordinate readout + hover hit-test for chains, bubbles, force nodes, skeleton.

import { state } from '../../simplify-state.js';
import { scheduleFrame } from '../../render/render-manager.js';
import { xToBp, getChromosome, isReady } from '../../data/spine.js';
import { formatBp } from '../../utils/format-utils.js';
import { hitTestForceNodes, hitTestBubbles, hitTestChains, hitTestSkeleton, formatForceNodeTooltip, formatTooltip, formatBubbleTooltip, formatSkeletonTooltip } from '../../utils/hit-test.js';

export function setupHover(canvas) {
    const tooltipEl = state.dom.tooltip;
    const cursorBpEl = state.dom.cursorBp;

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
            cursorBpEl.textContent = `${chr}:${formatBp(bp)}`;
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
            if (hitForceNode) {
                tooltipEl.innerHTML = formatForceNodeTooltip(hitForceNode);
            } else if (hitBubble) {
                tooltipEl.innerHTML = formatBubbleTooltip(hitBubble);
            } else if (hitChain) {
                tooltipEl.innerHTML = formatTooltip(hitChain);
            } else {
                tooltipEl.innerHTML = formatSkeletonTooltip(hitSkel);
            }
            tooltipEl.style.display = 'block';
            // Position tooltip near cursor, offset right and up
            const ttRect = tooltipEl.getBoundingClientRect();
            let tx = e.clientX + 14;
            let ty = e.clientY - ttRect.height - 8;
            // Keep on screen
            if (tx + ttRect.width > window.innerWidth - 8) tx = e.clientX - ttRect.width - 14;
            if (ty < 4) ty = e.clientY + 18;
            tooltipEl.style.left = tx + 'px';
            tooltipEl.style.top = ty + 'px';
            canvas.style.cursor = 'crosshair';
            scheduleFrame();
        } else if (state.hoveredChain || state.hoveredBubble || state.hoveredForceNode || state.hoveredSkeletonPl) {
            state.hoveredChain = null;
            state.hoveredBubble = null;
            state.hoveredForceNode = null;
            state.hoveredSkeletonPl = null;
            tooltipEl.style.display = 'none';
            canvas.style.cursor = 'grab';
            scheduleFrame();
        }
    });

    canvas.addEventListener('mouseleave', () => {
        cursorBpEl.textContent = '';
        if (state.hoveredChain || state.hoveredBubble || state.hoveredForceNode || state.hoveredSkeletonPl) {
            state.hoveredChain = null;
            state.hoveredBubble = null;
            state.hoveredForceNode = null;
            state.hoveredSkeletonPl = null;
            tooltipEl.style.display = 'none';
            canvas.style.cursor = 'grab';
            scheduleFrame();
        }
    });
}
