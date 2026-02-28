import recordsManager from '../../data/records/records-manager.js';

const ALPHA_CURVE = [1.0, 0.8, 0.6, 0.4, 0.25, 0.15];
const DIM_ALPHA = 0.06;

/**
 * BFS from startRecordId up to maxDistance hops.
 * Returns a Map<recordId, alpha> for every reachable record.
 */
export function computeFlashlightAlphas(startRecordId, maxDistance = 5) {
    const distances = new Map();
    distances.set(startRecordId, 0);
    const queue = [startRecordId];

    while (queue.length > 0) {
        const nodeId = queue.shift();
        const dist = distances.get(nodeId);
        if (dist >= maxDistance) continue;

        const links = recordsManager.getLinks(nodeId);
        for (const link of links) {
            const neighbor = link.sourceId === nodeId
                ? link.targetId
                : link.sourceId;
            if (!distances.has(neighbor)) {
                distances.set(neighbor, dist + 1);
                queue.push(neighbor);
            }
        }
    }

    // Convert distances to alpha values
    const alphas = new Map();
    for (const [id, dist] of distances) {
        alphas.set(id, ALPHA_CURVE[dist] ?? DIM_ALPHA);
    }
    return alphas;
}

export { DIM_ALPHA };
