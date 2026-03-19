/**
 * Position a tooltip element near the cursor, flipping to avoid viewport edges.
 *
 * @param {HTMLElement}  el         - The tooltip element to position
 * @param {number}       clientX    - Mouse X in viewport coords
 * @param {number}       clientY    - Mouse Y in viewport coords
 * @param {HTMLElement}  [container] - If provided, positions relative to container
 */
export function positionTooltip(el, clientX, clientY, container = null) {
    const ttRect = el.getBoundingClientRect();
    let tx = clientX + 14;
    let ty = clientY - ttRect.height - 8;
    if (tx + ttRect.width > window.innerWidth - 8) tx = clientX - ttRect.width - 14;
    if (ty < 4) ty = clientY + 18;

    if (container) {
        const rect = container.getBoundingClientRect();
        el.style.left = (tx - rect.left) + "px";
        el.style.top  = (ty - rect.top) + "px";
    } else {
        el.style.left = tx + "px";
        el.style.top  = ty + "px";
    }
}

/**
 * Create a managed tooltip attached to a container.
 *
 * @param {HTMLElement} container - The parent element for the tooltip
 * @returns {{ show: (html: string, clientX: number, clientY: number) => void, hide: () => void }}
 */
export function createTooltip(container) {
    const el = document.createElement("div");
    el.className = "hover-tooltip";
    el.style.display = "none";

    container.style.position ||= "relative";
    container.appendChild(el);

    return {
        show(html, clientX, clientY) {
            if (!html) return this.hide();
            el.innerHTML = html;
            el.style.display = "block";
            positionTooltip(el, clientX, clientY, container);
        },
        hide() {
            el.style.display = "none";
        }
    };
}
