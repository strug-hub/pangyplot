export default function setUpReheatEngine(forceGraph) {

    forceGraph.element.addEventListener('keydown', (event) => {
        if (event.key === 'h' || event.key === 'H') {
            forceGraph.d3ReheatSimulation();
        }
    });

}