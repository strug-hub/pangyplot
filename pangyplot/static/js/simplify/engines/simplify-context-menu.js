// Lightweight right-click context menu for the simplify viewer.
// Reuses the same CSS classes as core's right-click-menu (css/graph/right-click.css).

import { exportSimplifyToPng, exportSimplifyToSvg } from '../render/export-simplify.js';

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

function showMenu(x, y) {
    const menu = ensureMenu();
    menu.innerHTML = '';

    const label = document.createElement('div');
    label.classList.add('context-menu-category-label');
    label.textContent = 'Export:';
    menu.appendChild(label);

    addRow(menu, 'download', 'Download PNG', exportSimplifyToPng);
    addRow(menu, 'download', 'Download SVG', exportSimplifyToSvg);

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
