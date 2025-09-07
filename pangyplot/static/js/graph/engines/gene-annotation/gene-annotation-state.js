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

export function addNodeGeneAnnotation(iid, geneId) {
    if (!nodeAnnotations[iid]) {
        nodeAnnotations[iid] = {};
    }
    nodeAnnotations[iid][geneId] = [];
}
export function addNodeExonAnnotation(iid, geneId, exonNumber) {
    const exons = nodeAnnotations[iid][geneId] || [];
    exons.push(exonNumber);
    nodeAnnotations[iid][geneId] = exons;
}

export function getNodeAnnotations(iid) {
    return nodeAnnotations[iid] || [];
}

export function getAllNodeAnnotations() {
    return nodeAnnotations;
}

export function clearAllAnnotations() {
    nodeAnnotations = {};
}

export function clearCustomAnnotations() {
    for (const iid in nodeAnnotations) {
        for (const geneId in nodeAnnotations[iid]) {
            if (customGenes[geneId]) {
                delete nodeAnnotations[iid][geneId];
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
