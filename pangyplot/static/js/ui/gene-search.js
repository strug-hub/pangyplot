import eventBus from "../utils/event-bus.js";

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
    </div>`

function processSearchItemTemplate(template, data) {
    return template.replace(/{{\s*(\w+)\s*}}/g, (match, key) => {
        return data[key] || '';
    });
}

(function() { // suggestion logic
    let SWITCH_FOCUS = false;

    const geneSearchBar = document.getElementById("gene-search-bar");
    const geneSearchSuggestions = document.getElementById("gene-search-suggestions");

    const suggestionTemplate = `
        <div class="gene-search-suggestion-item" tabindex="{{index}}">
            ${geneSearchItemTemplate}
        </div>`;


    function geneToSearchItem(gene, index){
        let chrom = gene.chrom.split("#").pop();
        let type = "Type Unknown";
        
        if ('gene_type' in gene) {
            type = gene.gene_type.split('_').join(' ');
        } else if ('gene_biotype' in gene) {
            type = gene.gene_biotype.split('_').join(' ');
        }

        let geneData = {
            index: index,
            chromosome: chrom,
            start: gene.start,
            end: gene.end,
            name: gene.gene,
            id: gene.id,
            type: type
        };

        return processSearchItemTemplate(suggestionTemplate, geneData);
    }
        
    function fetchSuggestions(input) {
        fetch(`/search?type=gene&query=${input}`)
            .then(response => response.json())
            .then(data => {
                geneSearchSuggestions.setAttribute('tabindex', '-1');
                geneSearchSuggestions.innerHTML = data.map((gene, index) => geneToSearchItem(gene,index)).join('');
                geneSearchSuggestions.classList.add('active');
            })
            .catch(error => console.error('Error:', error));
    }

    function debounce(func, delay) {
        let debounceTimer;
        return function() {
            const context = this;
            const args = arguments;
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => func.apply(context, args), delay);
        };
    }

    geneSearchBar.addEventListener('input', debounce(function() {
        const input = this.value;
        if (input.length > 0) {
            fetchSuggestions(input);
        } else {
            geneSearchSuggestions.classList.remove('active');
        }
    }, 250));

    function navigateSuggestions(event) {
        const key = event.key;
        const active = document.activeElement;
        if (key === 'ArrowDown') {
            if (active.classList.contains('gene-search-suggestion-item')) {
                event.preventDefault();
                const next = active.nextElementSibling || active;
                SWITCH_FOCUS=true;
                next.focus();
                SWITCH_FOCUS=false;
            } else {
                const firstItem = document.querySelector('.gene-search-suggestion-item');
                if (firstItem) {
                    event.preventDefault();
                    firstItem.setAttribute('tabindex', '-1')
                    firstItem.focus();
                }
            }
        } else if (key === 'ArrowUp') {
            if (active.classList.contains('gene-search-suggestion-item')) {
                event.preventDefault();
                const prev = active.previousElementSibling || active;
                SWITCH_FOCUS=true;
                prev.focus();
                SWITCH_FOCUS=false;
            }
        }
    }
    
    geneSearchBar.addEventListener('keydown', function(event) {
        if (['ArrowUp', 'ArrowDown'].includes(event.key)) {
            navigateSuggestions(event);
        }
    });

    geneSearchSuggestions.addEventListener('keydown', function(event) {
        key = event.key;
        if (['ArrowUp', 'ArrowDown'].includes(event.key)) {
            navigateSuggestions(event);
            return;
        }
    
        if ((key.length === 1 && key.match(/\S/)) || key === 'Backspace') {
            geneSearchBar.focus();
            geneSearchBar.dispatchEvent(new Event('input'));
        }
    });

    geneSearchSuggestions.addEventListener('wheel', function(event) {
        const deltaY = event.deltaY;
        const contentHeight = this.scrollHeight;
        const visibleHeight = this.offsetHeight;
        const scrollPosition = this.scrollTop;
    
        if ((scrollPosition === 0 && deltaY < 0) || (scrollPosition + visibleHeight >= contentHeight && deltaY > 0)) {
            event.preventDefault();
        }
    });

    geneSearchBar.addEventListener('blur', function(event) {
        setTimeout(() => {
            if (!geneSearchSuggestions.contains(document.activeElement)) {
                geneSearchSuggestions.classList.remove('active');
            }
        }, 0);
    });

    geneSearchSuggestions.addEventListener('blur', function(event) {
        if (!SWITCH_FOCUS && !geneSearchSuggestions.contains(document.activeElement)) {
            if (document.activeElement !== geneSearchBar) {
                geneSearchSuggestions.classList.remove('active');
            }
        }
    }, true);


})();


(function() {

    const geneSearchBar = document.getElementById("gene-search-bar");
    const geneSearchSuggestions = document.getElementById("gene-search-suggestions");

    const selectedTemplate = `
        <div class="gene-search-selection-item">
            ${geneSearchItemTemplate}
        </div>`;

    function transferAttributes(source, target) {
        if (source && target) {
            target.innerHTML = source.innerHTML;
            var attributesToCopy = Array.from(source.attributes).filter(attr => attr.name !== 'id');
            attributesToCopy.forEach(attr => {
                target.setAttribute(attr.name, attr.value);
            });
        }
    }

    function updateSelectedGenePlaceholders(searchItem){

        var gene1 = document.getElementById('gene-search-result-1');
        var gene2 = document.getElementById('gene-search-result-2');
        var gene3 = document.getElementById('gene-search-result-3');
        var gene4 = document.getElementById('gene-search-result-4');

        gene1.classList.remove('option-button-selected');
        gene1.classList.add('option-button-unselected');
        gene2.classList.remove('option-button-selected');
        gene2.classList.add('option-button-unselected');
        gene3.classList.remove('option-button-selected');
        gene3.classList.add('option-button-unselected');
        gene4.classList.remove('option-button-selected');
        gene4.classList.add('option-button-unselected');

        transferAttributes(gene3, gene4)
        transferAttributes(gene2, gene3)
        transferAttributes(gene1, gene2)
        
        function getTextContent(suffix){
            const subElement = searchItem.querySelector(".gene-search-item-"+suffix);
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
        
        gene1.innerHTML = processSearchItemTemplate(selectedTemplate, geneData);
        gene1.classList.remove('placeholder-blank');
        gene1.classList.add('option-button-selected');
        gene1.classList.remove('option-button-unselected');

        const data = {
            chromosome: geneData.chromosome,
            start: parseInt(geneData.start, 10),
            end: parseInt(geneData.end, 10),
            source: "gene-search"
        };
        eventBus.publish("ui:coordinates-changed", data);        
    }

    function selectSuggestionItem(item) {
        while (item && !item.classList.contains('gene-search-suggestion-item')) {
            item = item.parentElement;
        }
        
        if (item) {
            updateSelectedGenePlaceholders(item);
            geneSearchBar.value = "";
            geneSearchSuggestions.classList.remove('active');
        }
    }
    
    geneSearchSuggestions.addEventListener('click', function(event) {selectSuggestionItem(event.target)});

    document.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            selectSuggestionItem(document.activeElement);
        }
    });

    function getCoordinateData(element){
        function getTextContent(suffix){
            const subElement = element.querySelector(".gene-search-item-" + suffix);
            if (subElement == null){ return null; }
            return subElement.textContent;
        }
    
        return {
            chromosome: getTextContent("chrom"),
            start: parseInt(getTextContent("start"), 10),
            end: parseInt(getTextContent("end"), 10),
            source: "gene-search"
        };
    }

    function selectedGeneClicked() {
        const data = getCoordinateData(this);
        eventBus.publish("ui:coordinates-changed", data);        
    }

    for (let geneSelectedId = 1; geneSelectedId <= 4; geneSelectedId++) {
        document.getElementById('gene-search-result-' + geneSelectedId).addEventListener('click', selectedGeneClicked);
    }

    eventBus.subscribe("ui:coordinates-changed", function (data) { 
        if (data.source === "gene-search"){
            return;
        }

        let flag = false;
        for (let i = 1; i <= 4; i++) {
            let element = document.getElementById('gene-search-result-' + i);
            element.classList.remove('option-button-selected');
            element.classList.add('option-button-unselected');

            let coordData = getCoordinateData(element);
            if( !flag && coordData.chromosome == data.chromosome &&
                coordData.start == data.start &&
                coordData.end == data.end){
                    flag = true;
                    element.classList.add('option-button-selected');
                    element.classList.remove('option-button-unselected');
                }
        }
    });

})();


var gene1Test = document.getElementById('gene-search-result-1');
const selectedTemplateTest = `
<div class="gene-search-selection-item">
    ${geneSearchItemTemplate}
</div>`;

gene1Test.innerHTML = processSearchItemTemplate(selectedTemplateTest, {
    chromosome: "chr18",
    start: "63476958",
    end: "63505085",
    name: "SERPINB5",
    id: "ENSG00000206075.14",
    type: "protein coding"
});
gene1Test.classList.remove('placeholder-blank');
gene1Test.classList.add('option-button-selected');
gene1Test.classList.remove('option-button-unselected');
