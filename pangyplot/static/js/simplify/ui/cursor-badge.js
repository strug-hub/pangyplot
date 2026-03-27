// Reusable cursor badge: a small FontAwesome icon that floats near the cursor.
//
// Usage:
//   const badge = createCursorBadge('fa-solid fa-lock');
//   badge.move(e.clientX, e.clientY);
//   badge.show();
//   badge.hide();

const OFFSET_X = 16;
const OFFSET_Y = 16;

export function createCursorBadge(iconClass, { size = 11, color = '#fff', opacity = 0.85 } = {}) {
    const el = document.createElement('i');
    el.className = iconClass;
    Object.assign(el.style, {
        position: 'fixed',
        pointerEvents: 'none',
        zIndex: '9999',
        fontSize: size + 'px',
        color,
        lineHeight: '1',
        userSelect: 'none',
        opacity: '0',
        transition: 'opacity 0.15s',
    });
    document.body.appendChild(el);

    return {
        show() { el.style.opacity = String(opacity); },
        hide() { el.style.opacity = '0'; },
        move(clientX, clientY) {
            el.style.left = (clientX + OFFSET_X) + 'px';
            el.style.top = (clientY + OFFSET_Y) + 'px';
        },
        setIcon(newClass) { el.className = newClass; },
        destroy() { el.remove(); },
    };
}
