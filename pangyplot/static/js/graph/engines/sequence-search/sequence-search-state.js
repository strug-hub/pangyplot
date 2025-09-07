let state = {
  results: {},   // { searchString: [ { iid, positions } ] }
  colors: {},    // { searchString: color }
  graph: null
};

export function initializeGraph(forceGraph) {
  state.graph = forceGraph;
}

export function getGraph() {
  return state.graph;
}

export function setColor(sequence, color) {
  state.colors[sequence] = color;
}

export function getColor(sequence) {
  return state.colors[sequence] || "#FF0000";
}

export function addResult(sequence, occurrences) {
  if (!state.results[sequence]) state.results[sequence] = [];
  state.results[sequence].push(occurrences);
}

export function clearResults(sequence) {
  if (sequence) delete state.results[sequence];
  else state.results = {};
}

export function getResults() {
  return state.results;
}
