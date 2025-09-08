export default function setUpPanZoomEngine(forceGraph) {

    const handleKeyChange = (event) => {
        if (event.shiftKey && !forceGraph.isPanZoomMode()) {
            forceGraph.setPanZoomMode();
        } else if (!event.shiftKey && forceGraph.isPanZoomMode()) {
            forceGraph.setSelectionMode();
        }
    };

    forceGraph.element.addEventListener('keydown', handleKeyChange);
    forceGraph.element.addEventListener('keyup', handleKeyChange);
    forceGraph.element.addEventListener('mousemove', handleKeyChange);

    forceGraph.element.addEventListener('wheel', (event) => {
        event.preventDefault();
    });
}

