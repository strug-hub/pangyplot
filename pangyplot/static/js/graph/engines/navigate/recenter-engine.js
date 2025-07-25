
export default function setUpRecenterEngine(forceGraph, canvasElement) {
    canvasElement.addEventListener('keydown', (event) => {

        if (event.code === 'Space' || event.key === ' ') {
            forceGraph.zoomToFit(200, 10, node => true); 
        }

        if (event.code === 'ArrowUp') {
            event.preventDefault();
            forceGraph.zoomToFit(200, 10, node => node.isSelected);
        }
    });
}
