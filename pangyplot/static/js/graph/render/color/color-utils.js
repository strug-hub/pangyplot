const MAX_CACHE_SIZE = 5000;
const stringColorCache = new Map();
const intColorCache = new Map();

function setCache(map, key, value, maxSize = MAX_CACHE_SIZE) {
    if (map.size >= maxSize) {
        const firstKey = map.keys().next().value;
        map.delete(firstKey);
    }
    map.set(key, value);
}

export function hexToRgb(hex) {
    if (hex.length === 4) {
        return [
            parseInt(hex[1] + hex[1], 16),
            parseInt(hex[2] + hex[2], 16),
            parseInt(hex[3] + hex[3], 16)
        ];
    }
    return [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16)
    ];
}

export function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b)
        .toString(16)
        .slice(1)
        .toUpperCase();
}

export function rgbStringToHex(rgba) {
    const match = rgba.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return "#000000";
    return `#${parseInt(match[1]).toString(16).padStart(2, '0')}${parseInt(match[2]).toString(16).padStart(2, '0')}${parseInt(match[3]).toString(16).padStart(2, '0')}`;
}

export function getGradientColor(value, rangeStart, rangeEnd, colorStops) {
    const numStops = colorStops.length;
    if (numStops === 1) return colorStops[0];

    let factor = (value - rangeStart) / (rangeEnd - rangeStart);
    factor = Math.max(0, Math.min(factor, 1)); // clamp

    const scaledFactor = factor * (numStops - 1);
    const index = Math.floor(scaledFactor);
    const remainder = scaledFactor - index;

    if (index >= numStops - 1) return colorStops[numStops - 1];

    const color1 = hexToRgb(colorStops[index]);
    const color2 = hexToRgb(colorStops[index + 1]);

    return rgbToHex(
        Math.round(color1[0] + remainder * (color2[0] - color1[0])),
        Math.round(color1[1] + remainder * (color2[1] - color1[1])),
        Math.round(color1[2] + remainder * (color2[2] - color1[2]))
    );
}

export function intToColor(seed, adjust = 0) {
    if (!intColorCache.has(seed)) {
        const a = 1664525;
        const c = 1013904223;
        const m = 2 ** 32;

        let r = (seed * a + c) % m;
        seed = (r * a + c) % m;
        let g = seed;
        seed = (g * a + c) % m;
        let b = seed;

        r = Math.floor((r / m) * 256);
        g = Math.floor((g / m) * 256);
        b = Math.floor((b / m) * 256);

        setCache(intColorCache, seed, [r, g, b]);
    }

    const [rBase, gBase, bBase] = intColorCache.get(seed);
    const l = Math.floor(adjust * 255);
    return `rgba(${Math.min(255, rBase + l)},${Math.min(255, gBase + l)},${Math.min(255, bBase + l)})`;
}

export function stringToColor(str, adjust = 0) {
    if (stringColorCache.has(str)) return stringColorCache.get(str);

    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0; // convert to 32-bit int
    }

    const color = intToColor(hash, adjust);
    setCache(stringColorCache, str, color);
    return color;
}
