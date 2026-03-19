
export function makeHoverLabel(container) {
    const el = document.createElement('div');
    el.className = 'hover-tooltip';
    el.style.display = 'none';

    container.style.position ||= 'relative';
    container.appendChild(el);

    return {
        show(html, clientX, clientY) {
            if (!html) return this.hide();
            el.innerHTML = html;
            el.style.display = 'block';

            // Smart edge-aware positioning
            const ttRect = el.getBoundingClientRect();
            let tx = clientX + 14;
            let ty = clientY - ttRect.height - 8;
            if (tx + ttRect.width > window.innerWidth - 8) tx = clientX - ttRect.width - 14;
            if (ty < 4) ty = clientY + 18;

            const rect = container.getBoundingClientRect();
            el.style.left = (tx - rect.left) + 'px';
            el.style.top  = (ty - rect.top) + 'px';
        },
        hide() {
            el.style.display = 'none';
        }
    };
}
