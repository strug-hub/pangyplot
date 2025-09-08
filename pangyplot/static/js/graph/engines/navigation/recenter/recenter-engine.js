export default function setUpRecenterEngine(forceGraph) {
    forceGraph.element.addEventListener('keydown', (event) => {

        if (event.code === 'Space' || event.key === ' ') {
            forceGraph.zoomToFit(200, 10, node => true); 
        }

        if (event.code === 'ArrowUp') {
            event.preventDefault();
            forceGraph.zoomToFit(200, 10, node => forceGraph.selected.has(node));
        }
    });
}
