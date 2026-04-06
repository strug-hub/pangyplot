// Tab visibility setup on page load.
// Previously handled core/simplify mode switching; now a no-op
// kept for the DOMContentLoaded side-effects that other modules expect.

window.addEventListener('DOMContentLoaded', () => {
    // Remove any leftover core-only elements
    for (const el of document.querySelectorAll('.core-only-setting')) {
        el.remove();
    }
});
