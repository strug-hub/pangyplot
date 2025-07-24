import { computeNodeCentroid } from "../utils/node-utils.js";

function groupNodesByBubble(nodes) {
    const bubbleGroups = {};

    for (const node of nodes) {

        if (node.bubble != null) {
            if (!bubbleGroups[node.bubble]) {
                bubbleGroups[node.bubble] = [];
            }
            bubbleGroups[node.bubble].push(node);
        }

        //if (node.chain != null) {
        //    if (!bubbleGroups[node.chain]) {
        //        bubbleGroups[node.chain] = [];
        //    }
        //    bubbleGroups[node.chain].push(node);
        //}
    }

    return bubbleGroups;
}
function computeStableRadius(group, centroid, tolerance = 500) {
    const distances = group.map(n => {
        const dx = n.x - centroid.x;
        const dy = n.y - centroid.y;
        return Math.sqrt(dx * dx + dy * dy);
    });

    const avg = d3.mean(distances);
    const stdDev = Math.sqrt(d3.mean(distances.map(d => Math.pow(d - avg, 2))));

    // If variation is small enough, return avg.
    if (stdDev <= tolerance) return avg;

    // Otherwise, nudge radius outward slightly to help normalize spacing.
    return avg + stdDev;
}


export default function bubbleCircularForce(forceGraph, strength = 0.01) {
    return function circularForce(alpha) {
        const nodes = forceGraph.graphData().nodes;
        const bubbleGroups = groupNodesByBubble(nodes);

        for (const [bubbleId, group] of Object.entries(bubbleGroups)) {
            if (group.length < 2) continue;

            centroid = computeNodeCentroid(group);
            
            const avgRadius = d3.mean(group, n => {
                const dx = n.x - centroid.x;
                const dy = n.y - centroid.y;
                return Math.sqrt(dx * dx + dy * dy);
            });

            //const stableRadius = computeStableRadius(group, centroid);

            //average radius tries to simply put the nodes in a circle
            //stable radius tries to make nodes equally distant from the center (ie perfect circle) 

            const radius = avgRadius;

            group.forEach((node, i) => {
                const dx = node.x - centroid.x;
                const dy = node.y - centroid.y;
                const angle = Math.atan2(dy, dx);

                const targetX = centroid.x + radius * Math.cos(angle);
                const targetY = centroid.y + radius * Math.sin(angle);

                const pullX = (targetX - node.x);
                const pullY = (targetY - node.y);

                node.vx += pullX * strength * alpha;
                node.vy += pullY * strength * alpha;
            });
        }
    };
}


