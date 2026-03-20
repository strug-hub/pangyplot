export function formatBp(bp, { unit = false } = {}) {
    if (bp == null || bp <= 0) return '?';
    bp = Math.round(Number(bp));
    if (!unit) return bp.toLocaleString();
    if (bp >= 1_000_000) return (bp / 1_000_000).toFixed(1) + ' Mb';
    if (bp >= 1000) return (bp / 1000).toFixed(1) + ' kb';
    return bp + ' bp';
}

export function formatNodeLabel(input) {
    let id = typeof input === 'string' ? input : (input.id || '');
    if (id.length < 1) return '';

    const firstChar = id.charAt(0);
    let fa = '';

    if (firstChar === 'b') {
        if (id.endsWith(':0')) {
            fa = `<i class="fa-solid fa-right-to-bracket"></i>`;
        } else if (id.endsWith(':1')) {
            fa = `<i class="fa-solid fa-right-from-bracket"></i>`;
        } else {
            fa = `<i class="fa-regular fa-circle"></i>`;
        }
    }
    if (firstChar === 's') {
        fa = `<i class="fa-regular fa-square"></i>`;
    }

    const trimmed = id.slice(1).split(':')[0];
    return `${fa} ${trimmed}`;
}

export function formatPercentage(count, total) {
    if (count == null || total == null || total === 0) return null;
    return ((count / total) * 100).toFixed(1) + '%';
}
