
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

    canvasElement.addEventListener('keydown', (event) => {
        if (!forceGraph){ return; }
        event.preventDefault();

        if (event.code === 'Space' || event.key === ' ') {
            forceGraph.zoomToFit(200, 10, node => true); //todo: selected only?
        }
        if (event.code === 'Delete') {
            //console.log("dle")
            //deleteHighlighted(forceGraph);
        }

        if (event.code === 'KeyZ') {
            BUBBLE_MODE = !BUBBLE_MODE
            console.log(BUBBLE_MODE)

        }
        if (event.code === 'ArrowUp') {

            const nodes = forceGraph.graphData().nodes;
    
            if (nodes.length > 0) {
                const box = findNodeBounds([nodes[0]]);
                forceGraph.centerAt(box.x + box.width/2, box.y + box.height/2, 1000);
            }
        }
        if (event.code === 'ArrowDown') {
            normalizeGraph(forceGraph.graphData());
        }

        graphInputStateUpdate(event, forceGraph, canvasElement);
    });


    // mouse

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

    canvasElement.addEventListener('wheel', (event) => {
        if (!forceGraph){ return; }
        event.preventDefault();

    });

    canvasElement.addEventListener('pointermove', (event) => {
        if (!forceGraph){ return; }
        const inputState = graphInputStateUpdate(event, forceGraph, canvasElement);
        const canvas = getCanvasBox(canvasElement);
        const coordinates = getCoordinates(canvasElement, event);

        if (INPUT_STATE === PAN_ZOOM_MODE){
            canvasElement.style.cursor = "grabbing";
        }
        showCoordinates(coordinates);


    });

    canvasElement.addEventListener('pointerdown', (event) => {
        if (!forceGraph){ return; }
        if (event.button !== 0) return;  // left-click only
        const inputState = graphInputStateUpdate(event, forceGraph, canvasElement);
        const canvas = getCanvasBox(canvasElement);
        const coordinates = getCoordinates(canvasElement, event);

    });
    
    document.addEventListener('pointerup', (event) => {
        if (!forceGraph){ return; }
        if (event.button !== 0) return;  // left-click only
        const inputState = graphInputStateUpdate(event, forceGraph, canvasElement);
        const canvas = getCanvasBox(canvasElement);
        const coordinates = getCoordinates(canvasElement, event);
        
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

function inputManagerNodeClicked(node, event, forceGraph){

}