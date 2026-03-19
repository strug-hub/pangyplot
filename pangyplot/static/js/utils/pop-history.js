// Browser-side pop history recorder.
// Records pop operations as a text log that can be exported and replayed.

const history = [];

export function recordPop(action, params) {
    history.push({ action, ...params });
}

export function clearHistory() {
    history.length = 0;
}
