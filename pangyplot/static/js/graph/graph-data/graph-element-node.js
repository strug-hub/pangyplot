class GraphElementNode {
    constructor(rawData, type) {
        if (new.target === GraphElementNode) {
            throw new Error("Cannot instantiate abstract class GraphElement directly.");
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

class Bubble extends GraphElementNode {
    constructor(rawBubble) {
        super(rawBubble, "bubble");
        this.parent = rawBubble.parent;
        this.subtype = rawBubble.subtype;
        this.chain = rawBubble.chain;
        this.chainStep = rawBubble.chain_step;
        this.size = rawBubble.size;
    }
}

class BubbleEnd extends GraphElementNode {
    constructor(rawBubbleEnd) {
        super(rawBubbleEnd, "bubble:end");
        this.subtype = rawBubbleEnd.subtype;
        this.chainEnd = rawBubbleEnd.chain_end;
        this.chain = rawBubbleEnd.chain;
        this.size = rawBubbleEnd.size;
    }
}

class Segment extends GraphElementNode {
    constructor(rawSegment) {
        super(rawSegment, "segment");
        this.insideBubble = rawSegment.inside_bubble;
    }
}

export default function deserializeNodes(rawNodes) {
    const elements = [];
    for (const rawNode of rawNodes) {
        if (rawNode.type === "segment") {
            elements.push(new Segment(rawNode));
        } else if (rawNode.type === "bubble") {
            elements.push(new Bubble(rawNode));
        } else if (rawNode.type === "bubble:end") {
            elements.push(new BubbleEnd(rawNode));
        }
    }
    return elements;
}