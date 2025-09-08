class GraphNodeData {
    constructor(rawData, type) {
        if (new.target === GraphNodeData) {
            throw new Error("Cannot instantiate abstract class GraphNodeData directly.");
        }

        this.id = rawData.id;
        this.type = type;
        this.seqLength = rawData.length;
        this.coords = { x1: rawData.x1, y1: rawData.y1, x2: rawData.x2, y2: rawData.y2 };
        this.ranges = rawData.ranges;
        this.gcCount = rawData.gc_count;
        this.nCount = rawData.n_count;
    }
}

class BubbleData extends GraphNodeData {
    constructor(rawBubble) {
        super(rawBubble, "bubble");
        this.parent = rawBubble.parent;
        this.subtype = rawBubble.subtype;
        this.chain = rawBubble.chain;
        this.chainStep = rawBubble.chain_step;
        this.size = rawBubble.size;
    }
}

class BubbleEndData extends GraphNodeData {
    constructor(rawBubbleEnd) {
        super(rawBubbleEnd, "bubble:end");
        this.subtype = rawBubbleEnd.subtype;
        this.chainEnd = rawBubbleEnd.chain_end;
        this.chain = rawBubbleEnd.chain;
        this.size = rawBubbleEnd.size;
    }
}

class SegmentData extends GraphNodeData {
    constructor(rawSegment) {
        super(rawSegment, "segment");
        this.insideBubble = rawSegment.inside_bubble;
    }
}

export default function deserializeNodes(rawNodes) {
    const elements = [];
    for (const rawNode of rawNodes) {
        if (rawNode.type === "segment") {
            elements.push(new SegmentData(rawNode));
        } else if (rawNode.type === "bubble") {
            elements.push(new BubbleData(rawNode));
        } else if (rawNode.type === "bubble:end") {
            elements.push(new BubbleEndData(rawNode));
        }
    }
    return elements;
}