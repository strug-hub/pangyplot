// Smart tooltip HTML formatter.
// Takes a plain data dict and knows how to render each key.

const TYPE_COLORS = {
    simple: '#4a90d9',
    superbubble: '#d94a90',
    segment: '#0762E5',
    bubble: '#F2DC0F',
    chain: '#FF6700',
};

function formatLength(bp) {
    return bp >= 1000 ? (bp / 1000).toFixed(1) + 'kb' : bp + 'bp';
}

function row(label, value, color) {
    const style = color ? ` style="color:${color}"` : '';
    return `<span class="tt-label">${label}</span> <span class="tt-val"${style}>${value}</span>`;
}

export function formatTooltipHtml(data) {
    const lines = [];

    if (data.chain != null)    lines.push(row('chain', data.chain));
    if (data.segment != null)  lines.push(row('segment', data.segment));
    if (data.bubble != null)   lines.push(row('bubble', data.bubble));
    if (data.type != null)     lines.push(row('type', data.type, TYPE_COLORS[data.type]));
    if (data.length != null)   lines.push(row('length', formatLength(data.length)));
    if (data.bubbles != null)  lines.push(row('bubbles', data.bubbles));
    if (data.polyline != null) lines.push(row('polyline', data.polyline + ' pts'));
    if (data.depth != null)    lines.push(row('depth', data.depth));

    return lines.join('<br>');
}
