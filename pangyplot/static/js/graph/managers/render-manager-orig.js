


const HOVER_PRECISION=2;

function getViewport(forceGraph, canvasWidth, canvasHeight, buffer){

    const topLeftGraph = forceGraph.screen2GraphCoords(0, 0);
    const bottomRightGraph = forceGraph.screen2GraphCoords(canvasWidth, canvasHeight);

    const viewportWidth = (bottomRightGraph.x - topLeftGraph.x) * buffer;
    const viewportHeight = (bottomRightGraph.y - topLeftGraph.y) * buffer;

    const viewport = {
        x1: topLeftGraph.x - (viewportWidth - (bottomRightGraph.x - topLeftGraph.x)) / 2,
        x2: bottomRightGraph.x + (viewportWidth - (bottomRightGraph.x - topLeftGraph.x)) / 2,
        y1: topLeftGraph.y - (viewportHeight - (bottomRightGraph.y - topLeftGraph.y)) / 2,
        y2: bottomRightGraph.y + (viewportHeight - (bottomRightGraph.y - topLeftGraph.y)) / 2,
    };

    return viewport;
}



function renderManagerPreRender(ctx, forceGraph, canvasWidth, canvasHeight){
    if (!forceGraph) { return; }
    const zoomFactor = ctx.canvas.__zoom["k"];

    const relSize = Math.max(10, (HOVER_PRECISION/zoomFactor));
    forceGraph.nodeRelSize(relSize);

    const viewport = getViewport(forceGraph, canvasWidth, canvasHeight, buffer=1.01)

    annotationManagerUpdate(ctx, forceGraph)

    updateRenderVisibility(forceGraph, viewport)

    ctx.save();
    
    geneRenderEngineDraw(ctx, forceGraph.graphData());
    //selectionEngineDraw(ctx, forceGraph.graphData());

    ctx.restore();
}

function renderManagerPostRender(ctx, forceGraph, canvasWidth, canvasHeight){
    ctx.save();

    const viewport = getViewport(forceGraph, canvasWidth, canvasHeight, buffer=1)

    drawGeneName(ctx, forceGraph.graphData(), viewport);

    labelEngineUpdate(ctx, forceGraph);

    searchSequenceEngineUpdate(ctx, forceGraph);
    
    renderDragInfluenceCircle(ctx, viewport);

    ctx.restore();
}

function renderManagerPaintNode(ctx, node) {

    if (node.isVisible && node.isDrawn){
        basicRenderPaintNode(ctx, node);
    }
}

function renderManagerPaintLink(ctx, link){
    if (link.isVisible && link.isDrawn){
        basicRenderPaintLink(ctx, link);
    }
}