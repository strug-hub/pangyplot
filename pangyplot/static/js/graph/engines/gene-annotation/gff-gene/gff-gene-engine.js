import eventBus from "../../../../utils/event-bus.js";
import recordsManager from "../../../data/records/records-manager.js";
import { populateGeneAnnotationsTable } from "../gene-annotation-ui.js"

const GFF_QUEUE_NAME = "gff-gene";

function annotationOverlap(annotation, node) {
    if (!node.record || !node.record.ranges) return null;
    if (node.record.ranges.length < 1) return;

    const [annotationStart, annotationEnd] = annotation.range;

    for (const [rangeStart, rangeEnd] of node.record.ranges) {
        // Find overlap interval
        const overlapStart = Math.max(rangeStart, annotationStart);
        const overlapEnd   = Math.min(rangeEnd, annotationEnd);

        if (overlapStart <= overlapEnd) {
            // Normalize to [0,1] relative to node range
            const span = rangeEnd - rangeStart;

            if (span === 0) {
                // Treat point range as "fully overlapped"
                return [0, 1];
            }
            const fracStart = (overlapStart - rangeStart) / span;
            const fracEnd   = (overlapEnd - rangeStart) / span;
            return [fracStart, fracEnd];
        }
    }

    return null;
}

function annotateTranscripts(forceGraph, graphData) {
    forceGraph.getRenderRecords(GFF_QUEUE_NAME).forEach(record => {

        //todo: handle different transcripts
        if (!record.hasTranscripts()) return;
        const transcript = record.getPrimaryTranscript();

        let overlap;

        graphData.nodes.forEach(node => {
            if (node.annotations.some(a => a.id === record.id)) return;

            overlap = annotationOverlap(transcript, node);

            if (overlap) {
                node.annotations.push({id: record.id, overlap});

                transcript.exons.forEach((exon) => {
                    overlap = annotationOverlap(exon, node);

                    if (overlap) {
                        node.annotations.push({id: `exon:${exon.exon_number}:${record.id}`, overlap});
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