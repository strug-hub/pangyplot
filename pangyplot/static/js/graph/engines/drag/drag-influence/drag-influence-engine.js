import dragInfluenceForce from "./drag-influence-force.js";

export var influence = 0.45;

export function setUpDragInfluenceEngine(forceGraph) {

  forceGraph.d3Force("dragInfluence", dragInfluenceForce(forceGraph));

  document.addEventListener("wheel", (event) => {
    if (!forceGraph.isDragging()) return;
    influence =
      event.deltaY > 0
        ? Math.max(influence - 0.025, 0.01)
        : Math.min(influence + 0.025, 1);
  });
}
