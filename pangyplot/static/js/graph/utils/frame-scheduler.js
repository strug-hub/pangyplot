// RAF-throttled frame scheduling. Decoupled from render-manager so engines
// can request repaints without importing the render layer.

let rafId = null;
let drawFn = null;

export function setDrawCallback(fn) {
    drawFn = fn;
}

export function scheduleFrame() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
        rafId = null;
        if (drawFn) drawFn();
    });
}
