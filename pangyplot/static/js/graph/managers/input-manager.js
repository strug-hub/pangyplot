
function inputManagerSetupInputListeners(forceGraph, canvasElement){

    function getCoordinates(canvasElement, event) {
        const rect = canvasElement.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const c = forceGraph.screen2GraphCoords(x, y);
        return {x:c.x, y:c.y, screen:{x:x, y:y}}
    };
    
    function getCanvasBox(canvasElement) {
        const rect = canvasElement.getBoundingClientRect();
        const tl = forceGraph.screen2GraphCoords(0,0);
        const br = forceGraph.screen2GraphCoords(rect.right-rect.left, rect.bottom-rect.top);
        return { min: {x:tl.x, y:tl.y}, max: {x:br.x, y:br.y} };
    };
    
    forceGraph.enableZoomPanInteraction(false);

    // keyboard

    rightClickManager = rightClickManagerSetup(forceGraph);

    canvasElement.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const x = e.pageX;
        const y = e.pageY;
        rightClickManager.showMenu(x, y);
      });

      canvasElement.addEventListener('click', () => {
        rightClickManager.hideMenu();
      });


    canvasElement.addEventListener('click', (event) => {
        if (!forceGraph){ return; }
        if (event.button !== 0) return;  // left-click only
        const inputState = graphInputStateUpdate(event, forceGraph, canvasElement);
        const canvas = getCanvasBox(canvasElement);
        const coordinates = getCoordinates(canvasElement, event);

        popNodeEngineMouseClick(event, forceGraph, canvasElement, canvas, coordinates, inputState);

    });

}

