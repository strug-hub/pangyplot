import { setGraphCoordinates, equalCoordinates, forceGraph, canvasElement }  from './graph-state.js';
import buildGraphData from './graph-data/graph-data.js';
import delLinkForce from './forces/del-link-force.js';
import bubbleCircularForce from './forces/bubble-circular-force.js';
import setUpRenderManager from './render/render-manager.js';
import setUpEngineManager from './engines/engine-manager.js';
import { setCanvasSize } from './render/canvas-size.js';
import updateGeneAnnotationEngine from './engines/gene-annotation/gene-annotation-engine.js';
import { anchorEndpointNodes } from './utils/node-utils.js';
import { zoomScaleUpdate } from './engines/navigate/zoom-scale.js';
import setUpForceSettings from './forces/force-setttings/force-settings.js';
import { clearGraphManager, setUpGraphManager} from './graph-data/graph-manager.js';

// todo https://github.com/vasturiano/d3-force-registry

function createForceGraph(graph){
    console.log("Creating force graph with data:", graph);

    const graphContainer = document.getElementById('graph-container')    
    const tabContainer = document.getElementById("tabs-container");
    
    graphContainer.classList.remove("graph-container-empty");
    graphContainer.scrollIntoView({ behavior: 'smooth' });
    tabContainer.style.display = "block";

    forceGraph.graphData(graph)
        .nodeId("nodeId")
        .nodeLabel("nodeId")
        .nodeVal(node => node.width)
        .autoPauseRedraw(false) // keep drawing after engine has stopped
        .d3VelocityDecay(0.1)
        .cooldownTicks(Infinity)
        .cooldownTime(Infinity)
        .d3AlphaDecay(0.0228)
        .minZoom(1e-6) //default = 0.01
        .maxZoom(1000) //default = 1000
        .warmupTicks(4)
        //.linkDirectionalParticles(4)

    setUpGraphManager(forceGraph);
    setCanvasSize(forceGraph);

    setUpEngineManager(forceGraph, canvasElement);
    setUpRenderManager(forceGraph, canvasElement);
    setUpForceSettings(forceGraph);

    updateGeneAnnotationEngine(forceGraph, canvasElement);

    // todo: pathManagerInitialize();
    // todo: searchSequenceEngineRerun();

    forceGraph.onEngineTick(() => {
        //debugInformationUpdate(forceGraph.graphData());
        zoomScaleUpdate(forceGraph);
    })
    
    // --- FORCES ---

    // Disable center force (no gravitational centering)
    forceGraph.d3Force('center', null);

    function link_force_distance(link) {
        if (link.type === "chain") {
            return link.length;
        }

        if (link.class === "node") {
            return link.length;
        }
        if (link.isDel){
            return 1;
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

    var GLOBAL_MULTIPLIER=1;
    forceGraph.d3Force('charge')
        .strength(-500)
        .distanceMax(1000*GLOBAL_MULTIPLIER);  // CONTROLS WAVEYNESS

    // Custom force to repel from deleted links
    forceGraph.d3Force('delLinkForce', delLinkForce());
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

    setTimeout(() => {
        forceGraph.zoomToFit(200, 10, node => true);
    }, 500); // wait 0.5 seconds 
    
}

function showLoader() {
    document.querySelector('.loader').style.display = 'block';
    //document.querySelector('.loader-filter').style.display = 'block';
}

function hideLoader() {
    document.querySelector('.loader').style.display = 'none';
    document.querySelector('.loader-filter').style.display = 'none';
}
hideLoader()

import { fetchData, buildUrl } from '../utils/network-utils.js';
function fetchAndConstructGraph(coordinates){
    if (equalCoordinates(coordinates)) return;
    setGraphCoordinates(coordinates);

    const url = buildUrl('/select', coordinates);
    fetchData(url, 'graph').then(rawGraph => {
        console.log("Fetched graph data:", rawGraph);
        clearGraphManager();

        const graphData = buildGraphData(rawGraph);
        anchorEndpointNodes(graphData.nodes, graphData.links);
        createForceGraph(graphData);
    });
}

document.addEventListener('constructGraph', function(event) {
    const { genome, chromosome, start, end } = event.detail;
    const coordinates = { genome, chromosome, start, end };
    fetchAndConstructGraph(coordinates);
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
    
    const SERPINB5 = {genome: "GRCh38", chromosome:"chr18", start:63466958, end:63515085, genome: "GRCh38"};
    const PRSS2 = {genome: "GRCh38", chromosome:"chr7", start:142760398-15000, end:142774564+1000, genome: "GRCh38"};
    const SLC9A3 = {genome: "GRCh38", chromosome:"chr5", start:470456, end:524449, genome: "GRCh38"};
    const FULL_CHR7 = {genome: "GRCh38", chromosome:"chr7", start:1, end:1427745640, genome: "GRCh38"};
    const BRCA2 = {genome: "GRCh38", chromosome:"chr13", start:32315086-1000, end:32400268+1000};
    const KDM5D = {genome: "GRCh38", chromosome:"chrY", start:19693650, end:19754942, genome: "GRCh38"};

    document.dispatchEvent(new CustomEvent("constructGraph", { detail: KDM5D }));
});