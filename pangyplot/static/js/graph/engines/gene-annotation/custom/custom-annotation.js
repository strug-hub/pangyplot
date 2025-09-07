import { addGene, removeGeneById, addNodeGeneAnnotation, clearCustomAnnotations} from "../gene-annotation-state.js";
import { rgbStringToHex, stringToColor } from "../../../render/color/color-utils.js";
import { populateGeneAnnotationsTable } from "../gene-annotation-ui.js"

const customCache = {};

export function deleteCustomAnnotation(geneId) {
    clearCustomAnnotations();
    removeGeneById(geneId);
    delete customCache[geneId];
    updateCustomAnnotations();
    populateGeneAnnotationsTable();
}

export function updateCustomAnnotations() {
    for (const geneId in customCache) {
        const nodes = customCache[geneId];
        nodes.forEach(node => {
            addNodeGeneAnnotation(node.iid, geneId);
        });
    }
}

export function createCustomGeneAnnotation(customName, nodes) {
    
    const geneData = {
        id: Date.now(),
        gene: customName,
        hasExons: () => false,
        isCustom: true,
        color: rgbStringToHex(stringToColor(customName)),
        isVisible: true
    };

    addGene(geneData, true);

    customCache[geneData.id] = nodes;

    nodes.forEach(node => {
        addNodeGeneAnnotation(node.iid, geneData.id);
    });
}
