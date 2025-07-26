import { initializeGraph, addResult, clearResults, setColor } from './sequence-search-state.js';
import { renderHighlights } from './sequence-search-render.js';

function getReverseComplement(seq) {
  const comp = { A: "T", T: "A", C: "G", G: "C", N: "N" };
  return seq.split("").reverse().map(ch => comp[ch] || ch).join("");
}

function sequenceToRegex(seq) {
  return new RegExp(seq.replace(/N/g, "[ATCG]"), "g");
}

export function runSearch(sequence, forceGraph) {

  const nodes = forceGraph.graphData().nodes;
  const revComp = getReverseComplement(sequence);
  const fwdRegex = sequenceToRegex(sequence);
  const revRegex = sequenceToRegex(revComp);

  nodes.forEach(node => {
    const seq = node.data.seq;
    if (!seq || seq.length < sequence.length) return;

    const occurrences = { nodeId: node.nodeId, positions: [] };

    let match;
    while ((match = fwdRegex.exec(seq)) !== null) {
      occurrences.positions.push([match.index, match.index + sequence.length - 1]);
    }
    while ((match = revRegex.exec(seq)) !== null) {
      occurrences.positions.push([match.index, match.index + revComp.length - 1]);
    }

    if (occurrences.positions.length) {
      occurrences.positions.sort((a, b) => a[0] - b[0]);
      addResult(sequence, occurrences);
    }
  });
}

// export default {
//   initialize: initializeGraph,
//   search: runSearch,
//   rerun: () => {
//     const sequences = Object.keys(getResults());
//     clearResults();
//     sequences.forEach(seq => runSearch(seq));
//   },
//   remove: clearResults,
//   setColor,
//   render: renderHighlights
// };

export default function setUpSequenceSearchEngine(forceGraph, canvasElement) {
}
