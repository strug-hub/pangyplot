/**
 * Attach open/close/escape behavior to an existing modal element in the DOM.
 *
 * @param {Object}  opts
 * @param {string}  opts.modalId        - DOM id of the modal element
 * @param {string}  [opts.openButtonId] - DOM id of the button that opens the modal
 * @param {string}  [opts.closeButtonId]- DOM id of the close button inside the modal
 * @param {boolean} [opts.startOpen]    - If true, modal is visible on init
 * @returns {{ open: () => void, close: () => void, isOpen: () => boolean }}
 */
export function setupModal({ modalId, openButtonId, closeButtonId, startOpen = false }) {
    const modal = document.getElementById(modalId);

    function open() { modal.style.display = "block"; }
    function close() { modal.style.display = "none"; }
    function isOpen() { return modal.style.display === "block"; }

    if (startOpen) open();
    else close();

    if (openButtonId) {
        const openBtn = document.getElementById(openButtonId);
        if (openBtn) openBtn.addEventListener("click", open);
    }

    if (closeButtonId) {
        const closeBtn = document.getElementById(closeButtonId);
        if (closeBtn) closeBtn.addEventListener("click", close);
    }

    modal.addEventListener("click", function (event) {
        if (event.target === modal) close();
    });

    // Close on Escape key
    window.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && isOpen()) close();
    });

    return { open, close, isOpen };
}
