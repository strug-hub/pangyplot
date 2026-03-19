// Deterministic color hash for gene names.
// Standalone copy of stringToColor + rgbStringToHex from color-utils.js.

function intToColor(seed) {
    const a = 1664525;
    const c = 1013904223;
    const m = 2 ** 32;

    let r = Math.abs((seed * a + c) % m);
    seed = Math.abs((r * a + c) % m);
    let g = seed;
    seed = Math.abs((g * a + c) % m);
    let b = seed;

    r = Math.floor((r / m) * 256);
    g = Math.floor((g / m) * 256);
    b = Math.floor((b / m) * 256);
    return [r, g, b];
}

function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    let [r, g, b] = intToColor(hash);
    // Ensure minimum brightness so labels are readable on dark badge backgrounds.
    // Lift each channel so the color stays vivid but never too dark.
    const minChannel = 100;
    r = minChannel + Math.floor(r * (255 - minChannel) / 255);
    g = minChannel + Math.floor(g * (255 - minChannel) / 255);
    b = minChannel + Math.floor(b * (255 - minChannel) / 255);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function geneColor(name) {
    return stringToColor(name);
}

/** Vivid gene color without brightness floor — for halo overlays on dark backgrounds. */
export function geneHaloColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = ((hash << 5) - hash) + name.charCodeAt(i);
        hash |= 0;
    }
    const [r, g, b] = intToColor(hash);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
