SEQUENCE_SEARCH_RESULTS={};
SEQUENCE_SEARCH_GRAPH=null;
SEQUENCE_SEARCH_COLOR={};

function searchSequenceEngineInitialize(forceGraph){
    SEQUENCE_SEARCH_GRAPH=forceGraph;
}

function searchSequenceEngineRerun() {
    const searchStrings = Object.keys(SEQUENCE_SEARCH_RESULTS);

    for (const key of searchStrings) {
        SEQUENCE_SEARCH_RESULTS[key] = [];
    }

    searchStrings.forEach(searchString => {
        searchSequenceEngineRun(searchString);
    });

    console.log("All sequences re-searched.");
}

function searchSequenceEngineRemove(searchString) {
    if (SEQUENCE_SEARCH_RESULTS.hasOwnProperty(searchString)) {
        delete SEQUENCE_SEARCH_RESULTS[searchString];
    }
    if (SEQUENCE_SEARCH_COLOR.hasOwnProperty(searchString)) {
        delete SEQUENCE_SEARCH_COLOR[searchString];
    }
}

function searchSequenceEngineSetColor(searchString, color) {
    SEQUENCE_SEARCH_COLOR[searchString] = color;
}

function searchSequenceEngineRun(searchString) {
    const graphData = SEQUENCE_SEARCH_GRAPH.graphData();
    const nodes = graphData.nodes;

    function getReverseComplement(sequence) {
        const complement = {
            A: "T",
            T: "A",
            C: "G",
            G: "C",
            N: "N"
        };
        return sequence
            .split("")
            .reverse()
            .map((char) => complement[char] || char)
            .join("");
    }

    // Convert the search string to a regular expression
    function sequenceToRegex(sequence) {
        return new RegExp(sequence.replace(/N/g, "[ATCG]"), "g"); // 'N' matches any base
    }

    const reverseComplement = getReverseComplement(searchString);
    const forwardRegex = sequenceToRegex(searchString);
    const reverseRegex = sequenceToRegex(reverseComplement);

    // Initialize results for the search string
    if (!SEQUENCE_SEARCH_RESULTS[searchString]) {
        SEQUENCE_SEARCH_RESULTS[searchString] = [];
    }

    // Iterate through nodes
    nodes.forEach(node => {
        const nodeData = node.data;
        const nodeSequence = nodeData.seq;

        if (!nodeSequence || nodeSequence.length < searchString.length) {
            return;
        }

        const nodeOccurrences = { nodeId: node.nodeId, positions: [] };

        // Search for the forward sequence
        let match;
        while ((match = forwardRegex.exec(nodeSequence)) !== null) {
            const start = match.index;
            const end = start + searchString.length - 1;
            nodeOccurrences.positions.push([start, end]);
        }

        // Search for the reverse complement
        while ((match = reverseRegex.exec(nodeSequence)) !== null) {
            const end = match.index + reverseComplement.length - 1;
            const start = match.index;
            // Adjust to ensure forward order
            nodeOccurrences.positions.push([start, end]);
        }

        // Sort positions by start index
        nodeOccurrences.positions.sort((a, b) => a[0] - b[0]);

        // If the sequence was found in this node, add the occurrence
        if (nodeOccurrences.positions.length > 0) {
            SEQUENCE_SEARCH_RESULTS[searchString].push(nodeOccurrences);
        }
    });

}


function searchSequenceEngineUpdate(ctx, forceGraph, svg=false) {
    return false; //TODO
    const graphData = forceGraph.graphData();
    const nodes = graphData.nodes;
    const svgData = []

    const segments = {};
    nodes.forEach(node => {
        if (!segments[node.nodeId]) {
            const totalKinks = node.data.kinks;
            segments[node.nodeId] = new Array(totalKinks).fill(null);
        }
        segments[node.nodeId][node.nodeIdx] = node;
    });

    // Loop over all sequences in SEQUENCE_SEARCH_RESULTS
    for (const [sequence, occurrences] of Object.entries(SEQUENCE_SEARCH_RESULTS)) {
        for (const occurrence of occurrences) {
            const { nodeId, positions } = occurrence;
            const segmentNodes = segments[nodeId];

            if (!segmentNodes) continue;

            const totalKinks = segmentNodes[0].data.kinks;
            const totalLen = segmentNodes[0].data.seqLen;

            // Special case: single-kink segment
            if (totalKinks === 1) {
                const node = segmentNodes[0]; 
                positions.forEach(([start, end]) => {

                    if(svg){
                        svgData.push({
                            type: "square",
                            fill: SEQUENCE_SEARCH_COLOR[sequence],
                            x: node.x,
                            y: node.y,
                            size: node.width*0.8
                        });
                    } else {
                        drawSquare(ctx, node.x, node.y, node.width*0.8, SEQUENCE_SEARCH_COLOR[sequence]);
                    }

                });
                continue;
            }

            let totalDistance = 0;
            const distances = [];
            for (let i = 0; i < segmentNodes.length - 1; i++) {
                const dx = segmentNodes[i + 1].x - segmentNodes[i].x;
                const dy = segmentNodes[i + 1].y - segmentNodes[i].y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                distances.push(distance);
                totalDistance += distance;
            }

            const kinkLengths = distances.map(dist => dist / totalDistance);
            
            positions.forEach(([start, end]) => {
                const startRatio = start / totalLen;
                const endRatio = end / totalLen;

                let path = []; 
                let cumulativeProportion = 0;

                for (let i = 0; i < segmentNodes.length - 1; i++) {
                    const node = segmentNodes[i];
                    const nextNode = segmentNodes[i + 1];
                    const kinkProportion = kinkLengths[i];

                    const nextCumulativeProportion = cumulativeProportion + kinkProportion;

                    // Handle start position
                    if (startRatio >= cumulativeProportion &&
                        startRatio < nextCumulativeProportion) {
                        const progress = (startRatio - cumulativeProportion) / kinkProportion;        
                        const startX = (1 - progress) * node.x + progress * nextNode.x;
                        const startY = (1 - progress) * node.y + progress * nextNode.y;
                        path.push({ x: startX, y: startY });
                    }

                    // Add intermediate kinks if the sequence spans multiple nodes
                    if (startRatio < cumulativeProportion &&
                        endRatio > cumulativeProportion && 
                        Math.abs(endRatio-startRatio) > 0.05) {
                        path.push({ x: node.x, y: node.y });
                    }

                    // Handle end position
                    if (endRatio >= cumulativeProportion &&
                        endRatio < nextCumulativeProportion) {
                        const progress = (endRatio - cumulativeProportion) / kinkProportion;
                        const endX = (1 - progress) * node.x + progress * nextNode.x;
                        const endY = (1 - progress) * node.y + progress * nextNode.y;
                        path.push({ x: endX, y: endY });
                    }

                    cumulativeProportion = nextCumulativeProportion;
                }

                if(svg){
                    svgData.push({
                        type: "path",
                        stroke: SEQUENCE_SEARCH_COLOR[sequence],
                        path: path,
                        width: 100
                    });
                } else {
                    drawPath(ctx, path, 100, SEQUENCE_SEARCH_COLOR[sequence]);
                }
            });
        }
    }

    if(svg){ return svgData; }
}
