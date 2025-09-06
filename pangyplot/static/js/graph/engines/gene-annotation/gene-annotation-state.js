import { Gene } from "./gene.js";

let genes = {};
let customGenes = {};

let nodeAnnotations = {};

export function addGene(geneData, custom = false) {
    const gene = new Gene(geneData);
    if (custom) {
        customGenes[gene.id] = gene;
    } else {
        genes[gene.id] = gene;
    }
}

export function getGene(id) {
    return genes[id] || null;
}

export function getAllGenes() {
    return Object.values(genes).concat(Object.values(customGenes));
}

export function clearAllGenes(clearCustom = false) {
    genes = {};
    if (clearCustom) {
        customGenes = {};
    }
}

export function addNodeGeneAnnotation(nodeId, geneId) {
    if (!nodeAnnotations[nodeId]) {
        nodeAnnotations[nodeId] = {};
    }
    nodeAnnotations[nodeId][geneId] = [];
}
export function addNodeExonAnnotation(nodeId, geneId, exonNumber) {
    const exons = nodeAnnotations[nodeId][geneId] || [];
    exons.push(exonNumber);
    nodeAnnotations[nodeId][geneId] = exons;
}

export function getNodeAnnotations(nodeId) {
    return nodeAnnotations[nodeId] || [];
}

export function getAllNodeAnnotations() {
    return nodeAnnotations;
}

export function clearAllAnnotations() {
    nodeAnnotations = {};
}

export function clearCustomAnnotations() {
    for (const nodeId in nodeAnnotations) {
        for (const geneId in nodeAnnotations[nodeId]) {
            if (customGenes[geneId]) {
                delete nodeAnnotations[nodeId][geneId];
            }
        }
    }
}

export function clearNodeAnnotations() {
    for (const nodeId in nodeAnnotations) {
        for (const geneId in nodeAnnotations[nodeId]) {
            if (customGenes[geneId]) {
                delete nodeAnnotations[nodeId][geneId];
            }
        }
    }
}


export function removeGeneById(geneId) {
    if (genes[geneId]) {
        delete genes[geneId];
    } if (customGenes[geneId]) {
        delete customGenes[geneId];
    }
}

export function setGeneVisibility(geneId, visible) {
    if (genes[geneId]) {
        genes[geneId].setVisibility(visible);
    }
}

export function setGeneColor(geneId, newColor) {
    if (genes[geneId]) {
        genes[geneId].setColor(newColor);
    }
}

export function getGeneColor(geneId) {
    if (genes[geneId]) {
        return genes[geneId].color;
    }
    return null;
}

export function setGeneExonVisibility(geneId, visible) {
    if (genes[geneId]) {
        genes[geneId].setExons(visible);
    }
}

export function getTableData() {
    const tableData = [];
    for (const gene of getAllGenes()) {

        tableData.push({
            id: gene.id,
            name: gene.name,
            hasExon: gene.hasExons(),
            isCustom: gene.isCustom,
            color: gene.color,
            visible: gene.isVisible
        });
    }
    return tableData;
}
