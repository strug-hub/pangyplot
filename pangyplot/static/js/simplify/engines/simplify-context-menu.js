// Lightweight right-click context menu for the simplify viewer.
// Reuses the same CSS classes as core's right-click-menu (css/graph/right-click.css).

import { exportSimplifyToPng, exportSimplifyToSvg } from '../render/export-simplify.js';
import { state } from '../simplify-state.js';
import { flipChain } from '../detail/data/polychain/polychain-adapter.js';
import { reheatSimulation } from '../detail/engines/force-engine.js';
import { scheduleFrame } from '../utils/frame-scheduler.js';
import { exportViewportGfa } from './selection/selection-popup.js';
import { popAllBubblesOnChain } from '../detail/model/pop-handler.js';
import { createCustomAnnotation } from '@simplify-data/custom-annotation-data.js';

let menuElement = null;

function ensureMenu() {
    if (menuElement) return menuElement;
    menuElement = document.createElement('div');
    menuElement.id = 'custom-context-menu';
    document.body.appendChild(menuElement);
    document.addEventListener('click', () => { menuElement.style.display = 'none'; });
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
        addCategoryLabel(menu, `Chain:`);
        addRow(menu, 'exchange', 'Flip Chain', () => {
            if (flipChain(chain.id)) {
                reheatSimulation();
                scheduleFrame();
            }
        });
        addRow(menu, 'expand', 'Pop All Bubbles', () => {
            popAllBubblesOnChain(chain.id);
            scheduleFrame();
        });
        addRow(menu, 'tag', 'Add Custom Annotation', () => {
            const name = prompt('Annotation name:');
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

    // --- Export actions (always shown) ---
    addCategoryLabel(menu, 'Export:');
    addRow(menu, 'download', 'Download PNG', exportSimplifyToPng);
    addRow(menu, 'download', 'Download SVG', exportSimplifyToSvg);
    if (state.detailData) {
        addRow(menu, 'file-export', 'Download GFA', exportViewportGfa);
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

export function setupContextMenu(canvas) {
    canvas.addEventListener('contextmenu', e => {
        e.preventDefault();
        showMenu(e.pageX, e.pageY);
    });
}
