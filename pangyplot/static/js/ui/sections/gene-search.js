import eventBus from '@event-bus';
import { setupSearchDropdown } from "@ui/elements/search-dropdown.js";
import { setupButtonGroup } from "@ui/components/button-group.js";

const geneSearchItemTemplate = `
    <div class="gene-search-item-line gene-search-item-line1">
        <div class="gene-search-item-chrom">{{chromosome}}</div>:
        <div class="gene-search-item-start">{{start}}</div> -
        <div class="gene-search-item-end">{{end}}</div>
    </div>
    <div class="gene-search-item-line gene-search-item-line2">
        <div class="gene-search-item-name">{{name}}</div>
        <div class="gene-search-item-geneid">{{id}}</div>
    </div>
    <div class="gene-search-item-line gene-search-item-line3">
        <div class="gene-search-item-type">{{type}}</div>
    </div>`;

const suggestionTemplate = `
    <div class="search-dropdown-item" tabindex="{{index}}">
        ${geneSearchItemTemplate}
    </div>`;

const selectedTemplate = `
    <div class="gene-search-selection-item">
        ${geneSearchItemTemplate}
    </div>`;

function processTemplate(template, data) {
    return template.replace(/{{\s*(\w+)\s*}}/g, (match, key) => {
        return data[key] || '';
    });
}

function geneToSearchItem(gene, index) {
    let chrom = gene.chrom.split("#").pop();
    let type = "Type Unknown";

    if ('gene_type' in gene) {
        type = gene.gene_type.split('_').join(' ');
    } else if ('gene_biotype' in gene) {
        type = gene.gene_biotype.split('_').join(' ');
    }

    return processTemplate(suggestionTemplate, {
        index: index,
        chromosome: chrom,
        start: gene.start,
        end: gene.end,
        name: gene.gene,
        id: gene.id,
        type: type
    });
}

// --- Search dropdown setup ---

const geneSearchBar = document.getElementById("gene-search-bar");
const geneSearchSuggestions = document.getElementById("gene-search-suggestions");

setupSearchDropdown({
    input: geneSearchBar,
    dropdown: geneSearchSuggestions,
    fetchResults(query) {
        return fetch(`/search?type=gene&query=${query}`)
            .then(response => response.json())
            .then(data => data.map((gene, index) => geneToSearchItem(gene, index)).join(''));
    },
    onSelect(item) {
        updateSelectedGenePlaceholders(item);
    }
});

// --- Result card management ---

const resultGroup = setupButtonGroup("gene-search-result-container");

function transferAttributes(source, target) {
    if (source && target) {
        target.innerHTML = source.innerHTML;
        var attributesToCopy = Array.from(source.attributes).filter(attr => attr.name !== 'id');
        attributesToCopy.forEach(attr => {
            target.setAttribute(attr.name, attr.value);
        });
    }
}

function getCoordinateData(element) {
    function getTextContent(suffix) {
        const subElement = element.querySelector(".gene-search-item-" + suffix);
        if (subElement == null) { return null; }
        return subElement.textContent;
    }

    return {
        chromosome: getTextContent("chrom"),
        start: parseInt(getTextContent("start"), 10),
        end: parseInt(getTextContent("end"), 10),
        source: "gene-search"
    };
}

function updateSelectedGenePlaceholders(searchItem) {

    var gene1 = document.getElementById('gene-search-result-1');
    var gene2 = document.getElementById('gene-search-result-2');
    var gene3 = document.getElementById('gene-search-result-3');
    var gene4 = document.getElementById('gene-search-result-4');

    resultGroup.deselectAll();

    transferAttributes(gene3, gene4);
    transferAttributes(gene2, gene3);
    transferAttributes(gene1, gene2);

    function getTextContent(suffix) {
        const subElement = searchItem.querySelector(".gene-search-item-" + suffix);
        return subElement.textContent;
    }

    let geneData = {
        chromosome: getTextContent("chrom"),
        start: getTextContent("start"),
        end: getTextContent("end"),
        name: getTextContent("name"),
        id: getTextContent("geneid"),
        type: getTextContent("type")
    };

    gene1.innerHTML = processTemplate(selectedTemplate, geneData);
    gene1.classList.remove('placeholder-blank');
    resultGroup.select(gene1);

    const data = {
        chromosome: geneData.chromosome,
        start: parseInt(geneData.start, 10),
        end: parseInt(geneData.end, 10),
        source: "gene-search"
    };
    eventBus.publish("ui:coordinates-changed", data);
}

function selectedGeneClicked() {
    const data = getCoordinateData(this);
    eventBus.publish("ui:coordinates-changed", data);
}

for (let geneSelectedId = 1; geneSelectedId <= 4; geneSelectedId++) {
    document.getElementById('gene-search-result-' + geneSelectedId).addEventListener('click', selectedGeneClicked);
}

eventBus.subscribe("ui:coordinates-changed", function (data) {
    if (data.source === "gene-search") {
        return;
    }

    resultGroup.deselectAll();
    for (let i = 1; i <= 4; i++) {
        let element = document.getElementById('gene-search-result-' + i);
        let coordData = getCoordinateData(element);
        if (coordData.chromosome == data.chromosome &&
            coordData.start == data.start &&
            coordData.end == data.end) {
            resultGroup.select(element);
            break;
        }
    }
});

