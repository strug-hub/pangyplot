import delLinkForce from './del-link-force.js';
import bubbleCircularForce from './bubble-circular-force.js';
import setUpForceSettings from './force-settings/force-settings.js';
import bubbleEndForce from './bubble-end-force.js';

function centerForce(forceGraph) {
    // Disable center force (no gravitational centering)
    forceGraph.d3Force('center', null);
}

function linkForce(forceGraph){

    function link_force_distance(link) {
        return link.length;
    }

    forceGraph.d3Force('link')
        .distance(link_force_distance) // target link size
        //.strength(0.95); // tolerance to the link size is
}

function collisionForce(forceGraph) {
    // Collision force: prevents node overlap
    //forceGraph.d3Force('collide', d3.forceCollide(50).radius(50));
    //using default
}

function chargeForce(forceGraph) {
    forceGraph.d3Force('charge')
        .strength(-1000)
        .distanceMax(2000);  // CONTROLS WAVEYNESS
}

function pauseAllForces(forceGraph) {
    forceGraph.d3AlphaDecay(1); // Rapid cooldown
    forceGraph.d3Force('link', null);
    forceGraph.d3Force('charge', null);
    forceGraph.d3Force('collide', null);
    forceGraph.d3Force('center', null);
}

export default function setUpForceManager(forceGraph){

    setUpForceSettings(forceGraph);

    centerForce(forceGraph);
    linkForce(forceGraph);
    collisionForce(forceGraph);
    chargeForce(forceGraph);

    // --- Force pause toggle (debugging) ---
    //pauseAllForces(forceGraph);
    // --- Force pause toggle (debugging) ---
    
    // Custom force to repel from deleted links
    //forceGraph.d3Force('delLinkForce', delLinkForce());

    forceGraph.d3Force('delLinkForce', delLinkForce());

    //forceGraph.d3Force('bubbleEndAttraction', bubbleEndForce(1, 50));

    //graphElement.addEventListener("click", evt => {
    //    const rect = graphElement.getBoundingClientRect();
    //    const mouseX = evt.clientX - rect.left;
    //    const mouseY = evt.clientY - rect.top;
    //    const graphCoords = forceGraph.screen2GraphCoords(mouseX, mouseY);
    
    //    triggerExplosion(forceGraph, graphCoords.x, graphCoords.y);
    //});
    
}