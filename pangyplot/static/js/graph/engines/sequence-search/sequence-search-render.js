import { getResults, getColor } from './sequence-search-state.js';

export function renderHighlights(ctx, svg = false) {
  const results = getResults();
  const svgData = [];

  for (const [sequence, occurrences] of Object.entries(results)) {
    const color = getColor(sequence);
    for (const { nodeId, positions } of occurrences) {
      positions.forEach(() => {
        if (svg) {
          svgData.push({ type: "square", color });
        } else {
          drawSquare(ctx, 0, 0, 20, color); // Placeholder
        }
      });
    }
  }
  return svg ? svgData : null;
}
