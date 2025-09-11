export default function setUpRenderQueueEngine(forceGraph) {
    forceGraph.renderQueue = {};

    forceGraph.addRenderQueue = function (name, priority) {
        this.renderQueue[name] = { priority, annotationRecords: [] };
    };

    forceGraph.clearRenderQueue = function (name) {
        forceGraph.renderQueue[name].annotationRecords = [];
    };

    forceGraph.addToRenderQueue = function (queueName, record) {
        this.renderQueue[queueName].annotationRecords.push(record);
    };

    forceGraph.removeFromRenderQueue = function (queueName, id) {
        const queue = this.renderQueue[queueName];
        const index = queue.annotationRecords.findIndex(record => record.id === id);
        if (index > -1) {
            const record = queue.annotationRecords[index];
            queue.annotationRecords.splice(index, 1);
            return record;
        }
        return null;
    }

    forceGraph.getRenderQueueRecord = function (queueName, id) {
        const queue = this.renderQueue[queueName];
        return queue.annotationRecords.find(record => record.id === id) || null;
    };

    forceGraph.getRenderRecords = function (queueName = null) {
        if (queueName) {
            return this.renderQueue[queueName].annotationRecords;
        }
        const queues = Object.entries(this.renderQueue)
            .sort(([, a], [, b]) => b.priority - a.priority);

        const records = [];
        for (const [, { annotationRecords }] of queues) {
            records.push(...annotationRecords);
        }
        return records;
    };

    forceGraph.buildRenderIndex = function (separateExons = false) {
        const annotationToElements = {};
        const layerCounters = {};
        const recordLookup = {};

        for (const record of this.getRenderRecords()) {
            if (record.isVisible) {
                recordLookup[record.id] = record;
            }
        }

        const graphData = this.graphData();
        for (const item of [...graphData.nodes, ...graphData.links]) {
            if (!item.isVisible || !item.isDrawn) continue;

            let count = 0;
            let record;
            let isExon;
            for (let annId of item.annotations) {
                if (annId.startsWith("exon:")) {
                    isExon = true;
                    const [pref, number, recordId] = annId.split(":");
                    record = recordLookup[recordId] || null;
                    if (!separateExons) annId = recordId;
                } else {
                    isExon = false;
                    record = recordLookup[annId] || null;
                }
                if (!record) continue;
                if (record.showExons != undefined) {
                    if (isExon && !record.showExons) continue;
                    if (!isExon && record.showExons) continue;
                }
                if (!annotationToElements[annId]) annotationToElements[annId] = [];
                annotationToElements[annId].push(item);
                count++;
            }
            layerCounters[item.iid] = count;
        }

        return { annotationToElements, layerCounters };
    };

}