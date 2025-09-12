import { createPathList } from './path-highlight-ui.js';

var pathData = [];
var sampleData = null;

function filterPaths(forceGraph, paths) {
    const nodeIdSet = new Set(forceGraph.graphData().nodes.map(n => n.id));

    function pathIntersectsNodeSet(path) {
        for (const step of path.path) {
            const [segment, bubbles] = step;
            const nodeId = segment.slice(0, -1); // Remove direction character
            if (nodeIdSet.has(nodeId)) return true;

            for (const bid of bubbles) {
                if (nodeIdSet.has(bid)) return true;
            }
        }
        return false;
    }

    return paths.filter(path => pathIntersectsNodeSet(path));
}

export function loadInPaths(forceGraph, paths) {
    pathData = filterPaths(forceGraph, paths);

    console.log("Loaded in paths:", pathData);

    for (const path of pathData) {
        console.log("Path:", path);
    }

    createPathList(pathData);
}

export async function loadInSamples(samples) {
    sampleData = samples;
}