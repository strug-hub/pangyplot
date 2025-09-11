import eventBus from "../../../../utils/event-bus.js";
import recordsManager from "../../../data/records/records-manager.js";
import { populateGeneAnnotationsTable } from "../gene-annotation-ui.js"
import { annotationOverlap } from "../gene-annotation-utils.js";

const GFF_QUEUE_NAME = "gff-gene";

function annotateTranscripts(forceGraph, graphData) {

    forceGraph.getRenderRecords(GFF_QUEUE_NAME).forEach(record => {

        //todo: handle different transcripts
        if (!record.hasTranscripts()) return;
        const transcript = record.getPrimaryTranscript();

        graphData.nodes.forEach(node => {

            if (annotationOverlap(transcript, node)) {
                node.annotations.push(record.id);

                transcript.exons.forEach((exon) => {
                    if (annotationOverlap(exon, node)) {
                        node.annotations.push(`exon:${exon.exon_number}:${record.id}`);
                    }
                });
            }
        });
    });
}

export function setUpGffGeneEngine(forceGraph) {

    forceGraph.addRenderQueue(GFF_QUEUE_NAME, 1);

    eventBus.subscribe("graph:data-replaced", async (forceGraph) => {
        const geneRecords = await recordsManager.getGenesByCoordinate(forceGraph.coords);

        geneRecords.forEach(record => {
            forceGraph.addToRenderQueue(GFF_QUEUE_NAME, record);
        });

        annotateTranscripts(forceGraph, forceGraph.graphData());
        populateGeneAnnotationsTable(forceGraph);
    });


    eventBus.subscribe('graph:bubble-popped', ({ bubbleId, graphData }) => {
        annotateTranscripts(forceGraph, graphData);
    });
}