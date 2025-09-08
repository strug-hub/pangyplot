const forceGraphElement = document.getElementById("graph");
const forceGraph = ForceGraph()(forceGraphElement);
const forceGraphCanvas = document.querySelector('#graph-container canvas');

forceGraph.element = forceGraphElement;
forceGraph.canvas = forceGraphCanvas;

forceGraph.rotation = 0;

forceGraph.coords = { genome: null, chromosome: null, start: null, end: null };
forceGraph.equalsCoords = function({ genome, chromosome, start, end }) {
    return this.coords.genome === genome &&
           this.coords.chromosome === chromosome &&
           this.coords.start === start &&
           this.coords.end === end;
};

forceGraphCanvas.ctx = forceGraphCanvas.getContext('2d');
forceGraph.getZoomFactor = function(){
    return this.canvas.__zoom["k"];
}

export default forceGraph;