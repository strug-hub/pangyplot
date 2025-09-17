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
        .warmupTicks(4)
        //.linkDirectionalParticles(4)


    setUpEngineManager(forceGraph);
    setUpRenderManager(forceGraph);
    setUpForceManager(forceGraph);
    setUpDataManager(forceGraph);
    setUpUiManager(forceGraph);

    const WIDE_MUC420 = {genome:"GRCh38", chromosome:"chr3", start:198347210, end:198855552}
    const NARROW_MUC420 = {genome:"GRCh38", chromosome:"chr3", start:198543540, end:198660739};
    const REPEAT_REGION = {genome:"GRCh38", chromosome:"chr3", start:198563043, end:198595149};
    const INVERSION_REGION = {genome:"GRCh38", chromosome:"chr3", start:198376687, end:198692934};

    const SERPINB5 = {genome: "GRCh38", chromosome:"chr18", start:63466958, end:63515085};
    const PRSS2 = {genome: "GRCh38", chromosome:"chr7", start:142760398-15000, end:142774564+1000};
    const CFTR = {genome: "GRCh38", chromosome:"chr7", start:117287120, end:117715971};
    const CFTR_T2T = {genome: "CHM13", chromosome:"chr7", start:118602456, end:119031369};
    const SUBTELOMERE = {genome: "CHM13", chromosome:"chr5", start:313451, end:430298+5000};
    
    const CFTR_10_11 = {genome: "GRCh38", chromosome:"chr7", start:117542131, end:117567102};
    const SLC9A3 = {genome: "GRCh38", chromosome:"chr5", start:470456, end:524449};
    const FULL_CHR7 = {genome: "GRCh38", chromosome:"chr7", start:1, end:1427745640};
    const BRCA2 = {genome: "GRCh38", chromosome:"chr13", start:32315086-1000, end:32400268+1000};
    const KDM5D = {genome: "GRCh38", chromosome:"chrY", start:19693650, end:19754942};
    const DAZ1 = {genome: "GRCh38", chromosome:"chrY", start:23129355, end:23199010};
    const EXOC3 = {genome: "GRCh38", chromosome:"chr5", start:321714, end:471937};
    
    eventBus.publish("ui:construct-graph", CFTR_T2T);

});


export default forceGraph;
