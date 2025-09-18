import bubbleCircularForce from './bubble-circular-force.js';
import layoutForce from './layout-force.js';
import setUpForceSettings from './settings/force-settings.js';
import bubbleEndForce from './bubble-end-force.js';
import delLinkForce from './del-link-force.js';
import defaults from './settings/force-defaults.js';

export function setFriction(forceGraph, value) {
    forceGraph.d3VelocityDecay(value);
}

export function setHeatDecay(forceGraph, value) {
    forceGraph.d3AlphaDecay(value);
}

function setCenterForce(forceGraph) {
    // Disable center force (no gravitational centering)
    forceGraph.d3Force('center', null);
}

export function setLinkForce(forceGraph, strength) {

    function linkForceDistance(link) {
        return link.length * strength;
    }

    forceGraph.d3Force('link')
        .distance(linkForceDistance) // target link size
        //.strength(); // based on node degree
}

export function setCollisionForce(forceGraph, strength, radius) {
    forceGraph.d3Force('collide', 
        d3.forceCollide()
            .strength(strength)
            .radius(radius));
}

export function setChargeForce(forceGraph, strength, distance) {
    forceGraph.d3Force('charge')
        .strength(strength)
        .distanceMax(distance);
}

export function setLayoutForce(forceGraph, level) {
    forceGraph.d3Force('layout', 
        layoutForce()
            .strengthLevel(level));
}

function pauseAllForces(forceGraph) {
    forceGraph.d3AlphaDecay(1); // Rapid cooldown
    forceGraph.d3Force('link', null);
    forceGraph.d3Force('charge', null);
    forceGraph.d3Force('collide', null);
    forceGraph.d3Force('center', null);
}

export default function setUpForceManager(forceGraph){

    // todo https://github.com/vasturiano/d3-force-registry

    setUpForceSettings(forceGraph);

    setFriction(forceGraph, defaults.FRICTION);
    setHeatDecay(forceGraph, defaults.HEAT_DECAY);

    setCenterForce(forceGraph);
    setLinkForce(forceGraph, defaults.LINK_STRENGTH);
    setCollisionForce(forceGraph, defaults.COLLISION_STRENGTH, defaults.COLLISION_RADIUS);
    setChargeForce(forceGraph, defaults.CHARGE_STRENGTH, defaults.CHARGE_DISTANCE);
    setLayoutForce(forceGraph, defaults.LAYOUT_LEVEL);

    //good force idea: charge but only for bubble children

    // --- Force pause toggle (debugging) ---
    //pauseAllForces(forceGraph);
    // --- Force pause toggle (debugging) ---
    
    forceGraph.d3Force('bubbleRoundness', bubbleCircularForce(forceGraph));
    
    // Custom force to repel from deleted links
    //forceGraph.d3Force('delLinkForce', delLinkForce());


    //forceGraph.d3Force('bubbleEndAttraction', bubbleEndForce(1, 50));

    //graphElement.addEventListener("click", evt => {
    //    const rect = graphElement.getBoundingClientRect();
    //    const mouseX = evt.clientX - rect.left;
    //    const mouseY = evt.clientY - rect.top;
    //    const graphCoords = forceGraph.screen2GraphCoords(mouseX, mouseY);
    
    //    triggerExplosion(forceGraph, graphCoords.x, graphCoords.y);
    //});
    
}