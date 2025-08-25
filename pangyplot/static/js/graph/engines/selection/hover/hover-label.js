
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
            const rect = container.getBoundingClientRect();
            el.style.left = clientX - rect.left + 'px';
            el.style.top  = clientY - rect.top + 'px';
            el.style.display = 'block';
        },
        hide() {
            el.style.display = 'none';
        }
    };
}
