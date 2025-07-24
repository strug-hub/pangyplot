function makeExplosionForce(graphNodes, protectedIds, centerX, centerY, strength) {
        return function explosionForce(alpha) {
            for (const node of graphNodes) {
                if (protectedIds.has(node.nodeId)) continue;

                const dx = node.x - centerX;
                const dy = node.y - centerY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist === 0) continue;

                //const decayFactor = dist / radius;
                const decayFactor = 1;
                const pushRatio = Math.exp(-2.5 * decayFactor);

                const normX = dx / dist;
                const normY = dy / dist;

                const pushStrength = strength * pushRatio;

                node.vx += normX * pushStrength;
                node.vy += normY * pushStrength;
            }
        };
}

function triggerExplosionForce(forceGraph, protectedNodes, centerX, centerY, strength) {
    function uuid() {
        return 'explosion-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    }

    //const strength = 200 * force;
    //const radius = 5000 + 500 * (force - 1);
    if (strength < 1){
        return;
    }

    const protectedIds = new Set(protectedNodes.map(n => n.nodeId));

    const forceName = uuid();
    const graphNodes = forceGraph.graphData().nodes;

    forceGraph.d3Force(
        forceName,
        makeExplosionForce(graphNodes, protectedIds, centerX, centerY, strength)
    );

    forceGraph.d3ReheatSimulation();

    setTimeout(() => {
        forceGraph.d3Force(forceName, null);
    }, 300);
}