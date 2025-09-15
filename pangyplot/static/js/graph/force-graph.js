import eventBus from '../utils/event-bus.js';
import setUpEngineManager from './engines/engine-manager.js';
import setUpForceManager from './forces/force-manager.js';
import { setUpRenderManager } from './render/render-manager.js';
import setUpUiManager from './ui/ui-manager.js';
import { setUpDataManager} from './data/data-manager.js';

const forceGraphElement = document.getElementById("graph");
const forceGraph = ForceGraph()(forceGraphElement);

document.addEventListener("DOMContentLoaded", function () {

    const forceGraphCanvas = document.querySelector('#graph-container canvas');

    forceGraph.element = forceGraphElement;
    forceGraph.element.classList.add("hidden");
    forceGraph.canvas = forceGraphCanvas;

    // Helper function to get the drawing context
    forceGraphCanvas.ctx = forceGraphCanvas.getContext('2d');
    forceGraph.getZoomFactor = function () {
        return this.canvas.__zoom["k"];
    }

    // Define the coordinates for the force graph
    forceGraph.coords = { genome: null, chromosome: null, start: null, end: null };
    forceGraph.equalsCoords = function ({ genome, chromosome, start, end }) {
        return this.coords.genome === genome &&
            this.coords.chromosome === chromosome &&
            this.coords.start === start &&
            this.coords.end === end;
    };

    forceGraph.graphData({nodes: [], links: []})
        .nodeId("iid")
        .enablePointerInteraction(false)
        .autoPauseRedraw(false) // keep drawing after engine has stopped
        .cooldownTicks(Infinity)
        .cooldownTime(Infinity)
        .minZoom(1e-6) //default = 0.01
        .maxZoom(10) //default = 1000
        .warmupTicks(4)
        //.linkDirectionalParticles(4)


    setUpEngineManager(forceGraph);
    setUpRenderManager(forceGraph);
    setUpForceManager(forceGraph);
    setUpDataManager(forceGraph);
    setUpUiManager(forceGraph);

    // wide muc4/20 region
    let chrom="chr3";
    let start=198347210;
    let end=198855552; // start+100000
    
    // narrow muc4/20 region
    start=198543540;
    end=198660739;
    
    // repeat region
    start=198563043;
    end=198595149;

    // inversion region
    start=198376687;
    end=198692934;
    
    const SERPINB5 = {genome: "GRCh38", chromosome:"chr18", start:63466958, end:63515085, genome: "GRCh38"};
    const PRSS2 = {genome: "GRCh38", chromosome:"chr7", start:142760398-15000, end:142774564+1000, genome: "GRCh38"};
    const CFTR = {genome: "GRCh38", chromosome:"chr7", start:117287120, end:117715971, genome: "GRCh38"};
    const SLC9A3 = {genome: "GRCh38", chromosome:"chr5", start:470456, end:524449, genome: "GRCh38"};
    const FULL_CHR7 = {genome: "GRCh38", chromosome:"chr7", start:1, end:1427745640, genome: "GRCh38"};
    const BRCA2 = {genome: "GRCh38", chromosome:"chr13", start:32315086-1000, end:32400268+1000};
    const KDM5D = {genome: "GRCh38", chromosome:"chrY", start:19693650, end:19754942, genome: "GRCh38"};
    const DAZ1 = {genome: "GRCh38", chromosome:"chrY", start:23129355, end:23199010, genome: "GRCh38"};

    eventBus.publish("ui:construct-graph", DAZ1);

});


export default forceGraph;