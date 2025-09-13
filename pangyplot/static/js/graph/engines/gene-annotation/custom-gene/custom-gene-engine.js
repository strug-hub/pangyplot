import eventBus from "../../../../utils/event-bus.js";
import recordsManager from "../../../data/records/records-manager.js";
import { populateGeneAnnotationsTable } from "../gene-annotation-ui.js"
import { CustomAnnotationRecord } from "../../../data/records/objects/annotation-record.js";

const CUSTOM_QUEUE_NAME = "custom-gene";

function deleteCustomAnnotation(forceGraph, id) {
    const record = forceGraph.removeFromRenderQueue(CUSTOM_QUEUE_NAME, id);
    informGraphElements(id, record.nodes, "delete");
    populateGeneAnnotationsTable(forceGraph);
}

function createCustomAnnotationRecord(forceGraph, name, nodes) {
    const customRecord = new CustomAnnotationRecord(name, nodes);
    forceGraph.addToRenderQueue(CUSTOM_QUEUE_NAME, customRecord);
    informGraphElements(customRecord.id, nodes, "add");
}

function informGraphElements(annotationId, nodes, action) {
    const nodeIdSet = new Set(nodes.map(node => node.id));
    const completedLinks = new Set();

    nodeIdSet.forEach(nodeId => {

        const nodeRecord = recordsManager.getNode(nodeId);
        const linkRecords = recordsManager.getLinks(nodeId);

        const filteredLinkRecords = linkRecords.filter(link => 
            nodeIdSet.has(link.sourceId) && 
            nodeIdSet.has(link.targetId) &&
            !completedLinks.has(link.iid));

        completedLinks.add(...filteredLinkRecords.map(link => link.iid));
        const graphData = recordsManager.extractElementsFromRecords([nodeRecord, ...filteredLinkRecords]);
        const elements = graphData.nodes.concat(graphData.links);

        if (action === "add") {
            for (const element of elements) {
                element.annotations.push({id: annotationId});
            }
        } else if (action === "delete") {
            for (const element of elements) {
                element.annotations = element.annotations.filter(ann => ann.id !== annotationId);
            }
        }
    });
}

function respondToBubblePop(forceGraph, bubbleId, graphData) {
    const bubbleRecord = recordsManager.getNode(bubbleId);

    const customAnnotations = bubbleRecord.elements.nodes.flatMap(node => node.annotations.map(ann => ann.id));
    const uniqueAnnotations = Array.from(new Set(customAnnotations));
    
    for (const annotationId of uniqueAnnotations) {
        const annotationRecord = forceGraph.getRenderQueueRecord(CUSTOM_QUEUE_NAME, annotationId);
        if (annotationRecord) {
            annotationRecord.nodes.push(...graphData.nodes);
            informGraphElements(annotationId, graphData.nodes, "add");
        }
    }
}

export function setUpCustomGeneEngine(forceGraph) {

    forceGraph.addRenderQueue(CUSTOM_QUEUE_NAME, 2);

    forceGraph.createCustomAnnotation = function (name, nodes) {
        createCustomAnnotationRecord(this, name, nodes);
        populateGeneAnnotationsTable(this);
    }

    forceGraph.deleteCustomAnnotation = function (id) {
        deleteCustomAnnotation(this, id);
        populateGeneAnnotationsTable(this);
    }

    eventBus.subscribe('graph:bubble-popped', ({ id, graphData }) => {
        respondToBubblePop(forceGraph, id, graphData);
    });
}