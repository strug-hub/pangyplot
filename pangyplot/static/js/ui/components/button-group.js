/**
 * Bind exclusive selection toggling to an existing container of .button-group elements.
 * Uses event delegation on the container.
 *
 * @param {string} containerId - DOM id of the container element
 * @param {Object} [opts]
 * @param {Function} [opts.onChange] - Called with (value, buttonEl) when selection changes.
 *                                     `value` is the button's data-style or data-value attribute.
 * @returns {{ getSelected: () => HTMLElement|null }}
 */
export function setupButtonGroup(containerId, { onChange } = {}) {
    const container = document.getElementById(containerId);

    function unselectAll() {
        container.querySelectorAll(".button-group").forEach(btn => {
            btn.classList.remove("button-group-selected");
            btn.classList.add("button-group-unselected");
        });
    }

    container.addEventListener("click", function (event) {
        const target = event.target.closest(".button-group");
        if (!target || !container.contains(target)) return;

        unselectAll();
        target.classList.add("button-group-selected");
        target.classList.remove("button-group-unselected");

        if (onChange) {
            const value = target.dataset.style || target.dataset.value || null;
            onChange(value, target);
        }
    });

    return {
        getSelected() {
            return container.querySelector(".button-group-selected");
        }
    };
}
