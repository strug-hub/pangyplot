import { createPathList } from './ui/path-highlight-ui.js';

var pathData = [];
var sampleData = null;

export function loadInPaths(paths) {
    pathData = paths;
    console.log("Loaded in paths:", pathData);

    for (const path of pathData) {
        console.log("Path:", path);
    }

    createPathList(pathData);
}

export async function loadInSamples(samples) {
    sampleData = samples;
}