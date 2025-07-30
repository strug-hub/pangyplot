import { Gene } from "./gene.js";

let genes = {};
let nodeAnnotations = {};

export function addGene(geneData) {
    const gene = new Gene(geneData);
    genes[gene.id] = gene;
}

export function getGene(id) {
    return genes[id] || null;
}

export function getAllGenes() {
    return Object.values(genes);
}

export function clearAllGenes() {
    genes = {};
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
    for (const gene of Object.values(genes)) {

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
