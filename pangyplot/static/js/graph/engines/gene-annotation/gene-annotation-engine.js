import { fetchAnnotations } from "./gene-annotation-fetch.js";
import { getGraphCoordinates } from "../../graph-data/graph-state.js";
import { getAllGenes } from "./gene-annotation-state.js";
import { addNodeGeneAnnotation, addNodeExonAnnotation, clearAllAnnotations } from "./gene-annotation-state.js";
import { annotationOverlap } from "./gene-annotation-utils.js";
import { populateGeneAnnotationsTable } from "./gene-annotation-ui.js"
import eventBus from '../../../utils/event-bus.js';
import { updateCustomAnnotations } from "./custom/custom-annotation.js";

function annotateTranscripts(forceGraph) {
    clearAllAnnotations();
    
    getAllGenes().forEach(gene => {

        if (!gene.hasTranscripts()) return;
        const transcript = gene.getPrimaryTranscript();

        forceGraph.graphData().nodes.forEach(node => {

            if (annotationOverlap(transcript, node)) {
                addNodeGeneAnnotation(node.nodeId, gene.id);

                transcript.exons.forEach((exon, index) => {
                    if (annotationOverlap(exon, node)) {
                        addNodeExonAnnotation(node.nodeId, gene.id, exon.exon_number);
                    }
                });
            }
        });
    });

    updateCustomAnnotations();

}

function updateAnnotations(forceGraph){
    const coordinates = getGraphCoordinates(forceGraph);
    fetchAnnotations(coordinates).then(result => {
        annotateTranscripts(forceGraph);
        populateGeneAnnotationsTable();
    });
}
export default function updateGeneAnnotationEngine(forceGraph, graphElement) {
    updateAnnotations(forceGraph);

    eventBus.subscribe("graph:updated", () => {
        updateAnnotations(forceGraph);
    });
}
