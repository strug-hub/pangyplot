// Lightweight right-click context menu for the viewer.
// Reuses the CSS classes from css/graph/right-click.css.

import { exportToPng, exportToSvg } from '../render/export.js';
import { state } from '../state.js';
import { flipChain } from '../detail/data/polychain/polychain-adapter.js';
import { reheatSimulation } from '../detail/engines/force-engine.js';
import { scheduleFrame } from '../utils/frame-scheduler.js';
import { exportViewportGfa } from './selection/selection-popup.js';
import { popAllBubblesOnChain, popHighlightedBubbles } from '../detail/model/pop-handler.js';
import { createCustomAnnotation } from '@graph-data/custom-annotation-data.js';
import { isDebugMode, t } from '@app-state';
import { getContainer } from '../detail/model/model-manager.js';
import { getBubbleStore } from '../detail/data/bubble-meta-cache.js';

let menuElement = null;
let _menuJustClosed = false;

/** True if the context menu was dismissed in the current event cycle. */
export function wasMenuJustClosed() {
    return _menuJustClosed;
}

function ensureMenu() {
    if (menuElement) return menuElement;
    menuElement = document.createElement('div');
    menuElement.id = 'custom-context-menu';
    document.body.appendChild(menuElement);
    document.addEventListener('click', () => {
        if (menuElement.style.display !== 'none') {
            menuElement.style.display = 'none';
            _menuJustClosed = true;
            requestAnimationFrame(() => { _menuJustClosed = false; });
        }
    });
    return menuElement;
}

function addRow(menu, iconName, label, onClick) {
    const row = document.createElement('div');
    row.classList.add('context-menu-row');

    const icon = document.createElement('i');
    icon.classList.add('fa', `fa-${iconName}`);
    row.appendChild(icon);

    const span = document.createElement('span');
    span.textContent = label;
    row.appendChild(span);

    row.addEventListener('click', e => {
        e.stopPropagation();
        menu.style.display = 'none';
        onClick();
    });

    menu.appendChild(row);
}

function addCategoryLabel(menu, text) {
    const label = document.createElement('div');
    label.classList.add('context-menu-category-label');
    label.textContent = text;
    menu.appendChild(label);
}

function showMenu(x, y) {
    const menu = ensureMenu();
    menu.innerHTML = '';

    // --- Chain actions (only when hovering a chain) ---
    const chain = state.hoveredChain;
    if (chain) {
        addCategoryLabel(menu, t('Chain:'));
        addRow(menu, 'exchange', t('Flip Chain'), () => {
            if (flipChain(chain.id)) {
                reheatSimulation();
                scheduleFrame();
            }
        });
        addRow(menu, 'expand', t('Pop All Bubbles'), () => {
            popAllBubblesOnChain(chain.id);
            scheduleFrame();
        });
        addRow(menu, 'tag', t('Add Custom Annotation'), () => {
            const name = prompt(t('Annotation name:'));
            if (!name || !name.trim()) return;
            const chainIds = new Set();
            if (state.selectedChains.size > 0) {
                for (const c of state.selectedChains.keys()) chainIds.add(c.id);
            } else {
                chainIds.add(chain.id);
            }
            createCustomAnnotation(name.trim(), chainIds);
        });
    }

    // --- Selection actions (when chains are highlighted) ---
    if (state.selectedChains.size > 0) {
        addCategoryLabel(menu, t('Selection:'));
        addRow(menu, 'expand', t('Pop Highlighted'), () => {
            popHighlightedBubbles();
            scheduleFrame();
        });
        if (state.detailData) {
            addRow(menu, 'file-export', t('Export GFA'), () => {
                exportViewportGfa();
            });
        }
    }

    // --- Export actions (always shown) ---
    addCategoryLabel(menu, t('Export:'));
    addRow(menu, 'download', t('Download PNG'), exportToPng);
    addRow(menu, 'download', t('Download SVG'), exportToSvg);

    // --- Debug actions (only in debug mode) ---
    if (isDebugMode() && chain) {
        addCategoryLabel(menu, 'Debug:');
        addRow(menu, 'clipboard', 'Copy Chain Info', () => {
            const info = buildChainDebugInfo(chain);
            navigator.clipboard.writeText(info);
        });
    }

    menu.style.display = 'block';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    // Adjust if overflowing viewport
    requestAnimationFrame(() => {
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = `${x - rect.width}px`;
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = `${y - rect.height}px`;
        }
    });
}

function buildChainDebugInfo(chain) {
    const lines = [];
    lines.push(`=== Chain Debug Info ===`);
    lines.push(`id: ${chain.id}`);
    lines.push(`subtype: ${chain.subtype}`);
    lines.push(`depth: ${chain.depth}`);
    lines.push(`length: ${chain.length} bp`);
    lines.push(`gc_count: ${chain.gcCount}`);
    lines.push(`bp_span: ${chain.bpSpan}`);
    lines.push(`bp_start: ${chain.bpStart}, bp_end: ${chain.bpEnd}`);
    lines.push(`n_bubbles: ${chain.nBubbles}`);
    lines.push(`source_segs: ${JSON.stringify(chain.sourceSegs)}`);
    lines.push(`sink_segs: ${JSON.stringify(chain.sinkSegs)}`);
    lines.push(`parent_chain: ${chain.parentChain}`);
    lines.push(`ancestors: ${JSON.stringify(chain.ancestors)}`);
    lines.push(`connector: ${chain.connector}`);

    // Bubble IDs and t-positions
    lines.push(`bubble_ids: ${JSON.stringify(chain.bubbleIds)}`);
    lines.push(`bubble_t: ${JSON.stringify(chain.bubblePositions)}`);

    // Polyline
    const pl = chain.polyline || [];
    lines.push(`polyline: ${pl.length} pts`);
    if (pl.length > 0) {
        lines.push(`  head: [${pl[0][0]?.toFixed(1)}, ${pl[0][1]?.toFixed(1)}]`);
        lines.push(`  tail: [${pl[pl.length-1][0]?.toFixed(1)}, ${pl[pl.length-1][1]?.toFixed(1)}]`);
    }

    // Container state
    const container = getContainer(chain.id);
    if (container) {
        lines.push(`--- Container ---`);
        lines.push(`spine_nodes: ${container.spineNodes.length}`);
        lines.push(`segments: ${container.segments.length}`);
        lines.push(`popped_ranges: ${JSON.stringify(container.poppedRanges)}`);
        lines.push(`bubbles: ${container.bubbles.length}`);
        for (const seg of container.segments) {
            lines.push(`  seg ${seg.id}: tRange=[${seg.tRange.start.toFixed(4)}, ${seg.tRange.end.toFixed(4)}] head=${JSON.stringify(seg.ends.head)} tail=${JSON.stringify(seg.ends.tail)}`);
        }
    }

    // Bubble meta cache
    const metaStore = getBubbleStore(chain.id);
    if (metaStore?.bubbles) {
        lines.push(`--- Bubble Meta (${metaStore.bubbles.length} entries) ---`);
        for (const b of metaStore.bubbles.slice(0, 20)) {
            lines.push(`  ${b.id}: t=${b.t?.toFixed(4)}, len=${b.length}, subtype=${b.subtype}`);
        }
        if (metaStore.bubbles.length > 20) {
            lines.push(`  ... (${metaStore.bubbles.length - 20} more)`);
        }
    }

    return lines.join('\n');
}

export function setupContextMenu(canvas) {
    canvas.addEventListener('contextmenu', e => {
        e.preventDefault();
        showMenu(e.pageX, e.pageY);
    });
}
