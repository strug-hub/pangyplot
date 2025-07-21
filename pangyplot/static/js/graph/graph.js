// global
var GRAPH_GENOME=null;
var GRAPH_CHROM=null;
var GRAPH_START_POS=null;
var GRAPH_END_POS=null;

var GLOBAL_MULTIPLIER=3

let forceGraph = null;

const FORCE_GRAPH_HEIGHT_PROPORTION = 0.8;
const FORCE_GRAPH_WIDTH_PROPORTION = 0.8;

DEBUG=true


var GRAPH_SPREAD_X_FORCE=0

function getGraphCoordinates(){
    return {genome: GRAPH_GENOME,
            chromosome:GRAPH_CHROM,
            start:GRAPH_START_POS,
            end:GRAPH_END_POS};
}

// todo https://github.com/vasturiano/d3-force-registry

function getCanvasWidth(){
    return window.innerWidth*FORCE_GRAPH_WIDTH_PROPORTION;
}
function getCanvasHeight(){
    return window.innerHeight*FORCE_GRAPH_HEIGHT_PROPORTION;
}

function renderGraph(graph){
    console.log("Rendering graph with data:", graph);
    const canvasElement = document.getElementById("graph");

    // Update the graph data without reinitializing the graph
    if (forceGraph) {
        forceGraph.graphData(graph);
        annotationManagerAnnotateGraph(forceGraph.graphData())
        searchSequenceEngineRerun();

        console.log("Graph data updated.");
    } else {

        forceGraph = ForceGraph()(canvasElement)
            .graphData(graph)
            .nodeId("__nodeid")
            .height(getCanvasHeight())
            .width(getCanvasWidth())
            .nodeRelSize(HOVER_PRECISION)
            .nodeVal(NODE_WIDTH)
            .autoPauseRedraw(false) // keep drawing after engine has stopped
            .d3VelocityDecay(0.1)
            .cooldownTicks(Infinity)
            .cooldownTime(Infinity)
            .onNodeDragEnd(node => dragManagerNodeDragEnd(node, forceGraph))
            .d3AlphaDecay(0.0228)
            .nodeCanvasObject((node, ctx) => renderManagerPaintNode(ctx, node)) 
            .linkCanvasObject((link, ctx) => renderManagerPaintLink(ctx, link)) 
            .nodeLabel("__nodeid")
            .onNodeDrag((node, translate) => dragManagerNodeDragged(node, translate, forceGraph))
            .onNodeClick((node, event) => inputManagerNodeClicked(node, event, forceGraph))
            .minZoom(1e-6) //default = 0.01
            .maxZoom(1000) //default = 1000
            .warmupTicks(4)
            //.linkDirectionalParticles(4)

        pathManagerInitialize();
        inputManagerSetupInputListeners(forceGraph, canvasElement);
        annotationManagerAnnotateGraph(forceGraph.graphData())

        window.addEventListener('resize', () => {
            forceGraph
                .height(getCanvasHeight())
                .width(getCanvasWidth());
        });

        console.log("forceGraph:", forceGraph);

        forceGraph.onEngineTick(() => {
            forceGraph.backgroundColor(colorManagerBackgroundColor());
            applyNodeLerps(forceGraph.graphData().nodes);
            debugInformationUpdate(forceGraph.graphData());
        })

        forceGraph.onRenderFramePre((ctx) => { renderManagerPreRender(ctx, forceGraph, getCanvasWidth(), getCanvasHeight()); })
        forceGraph.onRenderFramePost((ctx) => { renderManagerPostRender(ctx, forceGraph, getCanvasWidth(), getCanvasHeight()); })
        
        // --- FORCES ---

        // Disable center force (no gravitational centering)
        forceGraph.d3Force('center', null);

        function link_force_distance(link) {
            if (link.class === "node") {
                return link.length;
            }
            if (link.isDel){
                return 200;
            }

            return 10; //"edge"
        }

        forceGraph.d3Force('link')
            .distance(link_force_distance) // target link size
            .strength(0.5); // tolerance to the link size is

        // Collision force: prevents node overlap
        //forceGraph.d3Force('collide', d3.forceCollide(50).radius(50));

        function customCollisionRadius(node) {
            if (node.class === "mid") {
                return 20; 
            }
            return 50;
        }

        // Collision force: prevents node overlap, customized per node
        forceGraph.d3Force('collide', d3.forceCollide()
                                        .radius(customCollisionRadius)
                                        .strength(1)
                                        .iterations(2));

        forceGraph.d3Force('charge')
            .strength(-500)
            .distanceMax(1000*GLOBAL_MULTIPLIER);  // CONTROLS WAVEYNESS

        calculateExtrema(forceGraph.graphData())

        //forceGraph.d3Force('stress', stressForce(1));
        //forceGraph.d3Force('expansion', expansionForce(0.1));


        // Custom force to repel from deleted links
        forceGraph.d3Force('repelFromDeletedLinks', repelFromDelLinksDegree);

        forceGraph.d3Force('dragRipple', pullNeighborsWhenDragging);

        //forceGraph.d3Force('straightenX', xAxisStraighteningForce(0.02));
        //forceGraph.d3Force('flattenY', yAxisDampeningForce(0.02));
        forceGraph.d3Force('bubbleRoundness', bubbleCircularForce(forceGraph));

        //canvasElement.addEventListener("click", evt => {
        //    const rect = canvasElement.getBoundingClientRect();
        //    const mouseX = evt.clientX - rect.left;
        //    const mouseY = evt.clientY - rect.top;
        //    const graphCoords = forceGraph.screen2GraphCoords(mouseX, mouseY);
        
        //    triggerExplosion(forceGraph, graphCoords.x, graphCoords.y);
        //});
        

        // --- Force pause toggle ---

        const pause = false;
        if (pause) {
            forceGraph.d3AlphaDecay(1); // Rapid cooldown
            forceGraph.d3Force('link', null);
            forceGraph.d3Force('charge', null);
            forceGraph.d3Force('collide', null);
            forceGraph.d3Force('center', null);
        }
        graphSettingEngineSetup(forceGraph);
        searchSequenceEngineInitialize(forceGraph);
    }

    setTimeout(() => {
        forceGraph.zoomToFit(200, 10, node => true);
    }, 500); // wait 0.5 seconds 
    

    colorUpdateLegend();
}

function processGraphData(rawGraph){

    const nodeResult = processNodes(rawGraph.nodes);
    const links = processLinks(rawGraph.links);

    //anchorEndpointNodes(nodeResult.nodes, links)

    let graph = {"nodes": nodeResult.nodes, "links": links.concat(nodeResult.nodeLinks)}

    const normalizedGraph = normalizeGraph(graph);

    renderGraph(normalizedGraph);
    document.dispatchEvent(new CustomEvent("updatedGraphData", { detail: { graph: normalizedGraph } }));
}

function fetchGraph(genome, chromosome, start, end) {
    const url = buildUrl('/select', { genome, chromosome, start, end });
    fetchData(url, 'graph').then(fetchedData => {
        console.log("Fetched graph data:", fetchedData);
        processGraphData(fetchedData);
    });
}
function fetchAndConstructGraph(genome, chrom, start, end){
    if (genome === GRAPH_GENOME && 
        chrom === GRAPH_CHROM &&
        start === GRAPH_START_POS &&
        end === GRAPH_END_POS){
        return;
    }

    GRAPH_GENOME = genome;
    GRAPH_CHROM = chrom;
    GRAPH_START_POS = start;
    GRAPH_END_POS = end;
    
    annotationManagerFetch(genome, chrom, start, end);
    fetchGraph(genome, chrom, start, end);
}

document.addEventListener('constructGraph', function(event) {
    const graphElement = document.getElementById('graph-container')    
    graphElement.classList.remove("graph-container-empty");
    graphElement.scrollIntoView({ behavior: 'smooth' });

    fetchAndConstructGraph(event.detail.genome, event.detail.chrom, event.detail.start, event.detail.end);
});


document.addEventListener('DOMContentLoaded', function () {

    // wide muc4/20 region
    let chrom="chr3"
    let start=198347210
    let end=198855552 // start+100000
    
    // narrow muc4/20 region
    start=198543540;
    end=198660739;
    
    // repeat region
    start=198563043;
    end=198595149;

    // inversion region
    start=198376687
    end=198692934
    

    // SERPINB5
    let data = {genome: "GRCh38", chrom:"chr18", start:63466958, end:63515085, genome: "GRCh38"};

    // PRSS1-PRSS2 chr7:142745398-142775564
    data = {genome: "GRCh38", chrom:"chr7", start:142760398-15000, end:142774564+1000, genome: "GRCh38"};
    
    // SLC9A3
    //data = {genome: "GRCh38", chrom:"chr5", start:470456, end:524449, genome: "GRCh38"};

    //full chr7
    //data = {genome: "GRCh38", chrom:"chr7", start:1, end:1427745640, genome: "GRCh38"};

    //BRCA2
    data = {genome: "GRCh38", chrom:"chr13", start:32315086-1000, end:32400268+1000};

    //document.dispatchEvent( new CustomEvent('selectedCoordinatesChanged', { detail: data }));
    document.dispatchEvent(new CustomEvent("constructGraph", { detail: data }));
});