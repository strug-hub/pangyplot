// Pure utility functions -- no dependencies

export function formatBp(bp) {
    bp = Math.round(bp);
    return bp.toLocaleString();
}

export function subtypeColor(subtype) {
    return subtype === 'simple' ? '#4a90d9'
        : subtype === 'superbubble' ? '#d94a90' : '#90d94a';
}
