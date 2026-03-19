/**
 * Create a styled button element.
 *
 * @param {Object} opts
 * @param {string}   [opts.text]       - Button text label
 * @param {string}   [opts.icon]       - FontAwesome icon name (e.g. "trash", "eye", "undo")
 * @param {Function} [opts.onClick]    - Click handler
 * @param {string[]} [opts.classList]  - Additional CSS classes beyond "button-style"
 * @param {boolean}  [opts.selected]   - If true, adds "button-selected"
 * @param {boolean}  [opts.disabled]   - If true, sets disabled attribute
 * @returns {HTMLButtonElement}
 */
export function createButton({ text, icon, onClick, classList = [], selected = false, disabled = false } = {}) {
    const btn = document.createElement("button");
    btn.classList.add("button-style", ...classList);

    if (selected) btn.classList.add("button-selected");
    if (disabled) btn.disabled = true;

    let inner = "";
    if (icon) inner += `<i class="fa-solid fa-${icon}"></i>`;
    if (icon && text) inner += " ";
    if (text) inner += text;
    btn.innerHTML = inner;

    if (onClick) btn.addEventListener("click", onClick);

    return btn;
}
