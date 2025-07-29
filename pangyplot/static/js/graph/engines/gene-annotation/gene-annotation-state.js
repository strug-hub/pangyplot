import { Gene } from "./gene.js";

let genes = new Map();
let nodeAnnotations = {};

export function addGene(geneData) {
    const gene = new Gene(geneData);
    genes.set(gene.id, gene);
}

export function getGene(id) {
    return genes.get(id) || null;
}

export function getAllGenes() {
    return Array.from(genes.values());
}

export function clearAllGenes() {
    genes.clear();
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

export function setGeneExonVisibility(geneId, visible) {
    if (genes[geneId]) {
        genes[geneId].setExons(visible);
    }
}

export function getTableData() {
    const tableData = [];
    for (const gene of genes.values()) {

        tableData.push({
            id: gene.id,
            name: gene.name,
            hasExon: gene.hasExons(),
            color: gene.color,
            visible: gene.isVisible
        });
    }

    return tableData;
}
