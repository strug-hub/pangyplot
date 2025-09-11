import { populateGeneAnnotationsTable } from "./gene-annotation-ui.js"
import { setUpCustomGeneEngine } from "./custom-gene/custom-gene-engine.js";
import { setUpGffGeneEngine } from "./gff-gene/gff-gene-engine.js";
import setUpRenderQueueEngine from "./render-queue/render-queue-engine.js";

export default function setUpGeneAnnotationEngine(forceGraph) {
    setUpRenderQueueEngine(forceGraph);
    setUpCustomGeneEngine(forceGraph);
    setUpGffGeneEngine(forceGraph);

    populateGeneAnnotationsTable(forceGraph);
}