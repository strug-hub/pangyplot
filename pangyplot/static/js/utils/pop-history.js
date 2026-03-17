// Browser-side pop history recorder.
// Records pop operations as a text log that can be exported and replayed.

const history = [];

export function recordPop(action, params) {
    history.push({ action, ...params });
}

export function clearHistory() {
    history.length = 0;
}

export function dumpHistory(viewer) {
    const lines = [`# PangyPlot Pop History (${viewer})`];
    for (const entry of history) {
        const { action, ...params } = entry;
        const parts = Object.entries(params).map(([k, v]) => `${k}=${v}`);
        lines.push(`${action} ${parts.join(' ')}`);
    }
    return lines.join('\n') + '\n';
}

export function parseHistory(text) {
    const ops = [];
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const [action, ...rest] = trimmed.split(' ');
        const params = {};
        for (const token of rest) {
            const eq = token.indexOf('=');
            if (eq > 0) {
                params[token.slice(0, eq)] = token.slice(eq + 1);
            }
        }
        ops.push({ action, ...params });
    }
    return ops;
}

export async function saveHistory(viewer) {
    const content = dumpHistory(viewer);
    const filename = `history/${viewer}_history.txt`;
    try {
        const resp = await fetch('/debug/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, content }),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        console.log(`Saved ${filename} (${history.length} ops)`);
    } catch (e) {
        console.warn('Pop history save failed:', e);
    }
}

export async function loadHistory(viewer) {
    const filename = `history/${viewer}_history.txt`;
    try {
        const resp = await fetch(`/debug/read?file=${encodeURIComponent(filename)}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();
        return parseHistory(text);
    } catch (e) {
        console.warn('Pop history load failed:', e);
        return null;
    }
}
