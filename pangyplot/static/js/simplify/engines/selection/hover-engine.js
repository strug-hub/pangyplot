// Cursor coordinate readout + hover hit-test for chains, bubbles, force nodes, skeleton.

import { state } from '../../simplify-state.js';
import { scheduleFrame } from '../../utils/frame-scheduler.js';
import { xToBp, isReady } from '../reference-spine-engine.js';
import { formatBp } from '../../utils/format-utils.js';
import { hitTestChains, getChainTooltip, hitTestJunctionLinks, getJunctionLinkTooltip } from '../../detail/engines/polychain/polychain-hover-engine.js';
import { hitTestForceNodes, hitTestBubbles, getForceNodeTooltip, getBubbleTooltip } from '../../detail/engines/node-hover-engine.js';
import { hitTestSkeleton, getSkeletonTooltip } from '../../skeleton/engines/skeleton-hover-engine.js';
import { formatTooltipHtml } from '../../ui/tooltip-formatter.js';
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
        const chr = state.chromosome;
        if (bp !== null && chr) {
            updateCursorBp(`${chr}:${formatBp(bp)}`);
        }

        // Hit-test priority: force nodes > bubbles > chains > junction links > skeleton
        const hitForceNode = hitTestForceNodes(layoutX, layoutY);
        const hitBubble = hitForceNode ? null : hitTestBubbles(layoutX, layoutY);
        const hitChain = (hitForceNode || hitBubble) ? null : hitTestChains(layoutX, layoutY);
        const hitJLink = (hitForceNode || hitBubble || hitChain) ? null : hitTestJunctionLinks(layoutX, layoutY);
        const hitSkel = (hitForceNode || hitBubble || hitChain || hitJLink) ? null : hitTestSkeleton(layoutX, layoutY);
        const hit = hitForceNode || hitBubble || hitChain || hitJLink || hitSkel;

        if (hit) {
            state.hoveredForceNode = hitForceNode;
            state.hoveredBubble = hitBubble;
            state.hoveredChain = hitChain;
            state.hoveredJunctionLink = hitJLink;
            state.hoveredSkeletonPl = hitSkel;

            let data;
            if (hitForceNode) data = getForceNodeTooltip(hitForceNode);
            else if (hitBubble) data = getBubbleTooltip(hitBubble);
            else if (hitChain) data = getChainTooltip(hitChain);
            else if (hitJLink) data = getJunctionLinkTooltip(hitJLink);
            else data = getSkeletonTooltip(hitSkel);

            showTooltip(formatTooltipHtml(data), e.clientX, e.clientY);
            canvas.style.cursor = 'crosshair';
            scheduleFrame();
        } else if (state.hoveredChain || state.hoveredBubble || state.hoveredForceNode || state.hoveredJunctionLink || state.hoveredSkeletonPl) {
            state.hoveredChain = null;
            state.hoveredBubble = null;
            state.hoveredForceNode = null;
            state.hoveredJunctionLink = null;
            state.hoveredSkeletonPl = null;
            hideTooltip();
            canvas.style.cursor = 'grab';
            scheduleFrame();
        }
    });

    canvas.addEventListener('mouseleave', () => {
        updateCursorBp('');
        if (state.hoveredChain || state.hoveredBubble || state.hoveredForceNode || state.hoveredJunctionLink || state.hoveredSkeletonPl) {
            state.hoveredChain = null;
            state.hoveredBubble = null;
            state.hoveredForceNode = null;
            state.hoveredJunctionLink = null;
            state.hoveredSkeletonPl = null;
            hideTooltip();
            canvas.style.cursor = 'grab';
            scheduleFrame();
        }
    });
}
