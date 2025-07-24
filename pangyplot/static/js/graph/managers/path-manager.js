import { fetchData, buildUrl } from '../utils/network-utils.js';

PATH_SELECTER="path-selector";
CURRENTLY_SELECTED_PATH = null;
var pathData = null;

function fetchSamples() {
    const url = '/samples';
    return fetchData(url, 'samples').then(fetchedData => {
        return fetchedData;
    });
}

function pathManagerInitialize() {
    
    fetchSamples().then(fetchedSamples => {
        samples = fetchedSamples;
        
        var select = document.getElementById(PATH_SELECTER);

        samples.forEach(function(sample) {
            var opt = document.createElement("option");
            opt.value = sample.id; 
            opt.textContent = sample.id;
            opt.setAttribute('data-index', sample.index);
            select.appendChild(opt);
        });
    });
}

function pathManagerShouldHighlightLink(link){
    if (!CURRENTLY_SELECTED_PATH || ! link.haplotype || CURRENTLY_SELECTED_PATH >= link.haplotype.length){
        return false;
    }
    return link.haplotype[CURRENTLY_SELECTED_PATH];
}

document.getElementById(PATH_SELECTER).addEventListener('change', function() {
    var selectedOption = this.options[this.selectedIndex];
    var selectedId = selectedOption.value; 
    var selectedIndex = selectedOption.getAttribute('data-index');

    CURRENTLY_SELECTED_PATH = selectedIndex; 
});



