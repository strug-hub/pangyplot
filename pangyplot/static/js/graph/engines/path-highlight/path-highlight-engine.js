import { fetchData, buildUrl } from '../../../utils/network-utils.js';
import { getGraphCoordinates } from '../../graph-data/graph-state.js';
import { loadInSamples, loadInPaths } from './path-highlight-state.js';
import { setAnimationPath } from './animation/animation-state.js';
import { setupUi } from './ui/path-highlight-ui.js';

async function fetchPathData(sample){
    const params = { sample, ...getGraphCoordinates() };
    const url = buildUrl('/path', params);
    fetchData(url, "path-selection").then(paths => {

        paths.sort((a, b) => b["length"] - a["length"]);
        const longestPath = paths[0];

        loadInPaths(paths);
        setAnimationPath(longestPath);
    });
}

export default async function setUpPathHighlightEngine() {
    const samples = await fetchData('/samples', "path-selection");
    loadInSamples(samples);
    setupUi(samples);

    const pathSelector = document.getElementById('path-selector');
    pathSelector.addEventListener('change', function () {
        const selectedOption = pathSelector.options[pathSelector.selectedIndex];
        fetchPathData(selectedOption.value);
    });
    

}
