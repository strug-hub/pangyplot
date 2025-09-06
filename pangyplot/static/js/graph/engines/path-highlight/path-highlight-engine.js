import { fetchData, buildUrl } from '../../../utils/network-utils.js';
import { getGraphCoordinates } from '../../graph-data/graph-state.js';
import { loadInSamples, loadInPaths } from './path-highlight-state.js';
import { setupUi } from './path-highlight-ui.js';

async function fetchPathData(sample){
    const params = { sample, ...getGraphCoordinates() };
    const url = buildUrl('/path', params);
    fetchData(url, "path-selection").then(paths => {
        loadInPaths(paths);
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
