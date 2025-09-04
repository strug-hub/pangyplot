import { fetchData, buildUrl } from '../../../utils/network-utils.js';
import { getGraphCoordinates } from '../../graph-data/graph-state.js';
import { loadInPaths, playAnimation } from './path-highlight-state.js';

const PATH_SELECTOR = "path-selector";
const PATH_SELECT_BUTTON = "path-select-button"
var CURRENTLY_SELECTED_PATH = null;
var pathData = null;

async function fetchPathData(sample){
    const params = { sample, ...getGraphCoordinates() };
    const url = buildUrl('/path', params);
    fetchData(url, "path-selection").then(paths => {
        loadInPaths(paths);
    });
}

export default async function setUpPathHighlightEngine() {

    const samples = await fetchData('/samples', "path-selection");
    console.log("Fetched samples:", samples);
    var select = document.getElementById(PATH_SELECTOR);

    samples.forEach(function (id, index) {
        var opt = document.createElement("option");
        opt.value = id;
        opt.textContent = id;
        opt.setAttribute('data-index', index);
        select.appendChild(opt);
    });

    //document.getElementById(PATH_SELECTOR).addEventListener('change', function () {
    document.getElementById(PATH_SELECT_BUTTON).addEventListener('click', function () {
        const selectedOption = document.getElementById(PATH_SELECTOR).options[document.getElementById(PATH_SELECTOR).selectedIndex];
        const selectedId = selectedOption.value;
        console.log("Selected path:", selectedId);
        const selectedIndex = selectedOption.getAttribute('data-index');

        fetchPathData(selectedId);
    });

    document.getElementById("path-play-button").addEventListener("click", function () {
        playAnimation();
    });
}

function pathManagerShouldHighlightLink(link) {
    if (!CURRENTLY_SELECTED_PATH || !link.haplotype || CURRENTLY_SELECTED_PATH >= link.haplotype.length) {
        return false;
    }
    return link.haplotype[CURRENTLY_SELECTED_PATH];
}


