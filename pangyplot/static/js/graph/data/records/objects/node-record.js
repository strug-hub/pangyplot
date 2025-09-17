import GraphObjectRecord from './graph-object-record.js';

export class NodeRecord extends GraphObjectRecord {
    constructor(rawData, type) {
        if (new.target === NodeRecord) {
            throw new Error("Cannot instantiate abstract class NodeRecord directly.");
        }

        super();

        this.id = rawData.id;
        this.type = type;
        this.seqLength = rawData.length;
        this.coords = { x1: rawData.x1, y1: rawData.y1, x2: rawData.x2, y2: rawData.y2 };
        this.ranges = rawData.ranges;
        this.gcCount = rawData.gc_count;
        this.nCount = rawData.n_count;
    }
}

export class BubbleRecord extends NodeRecord {
    constructor(rawBubble) {
        super(rawBubble, "bubble");
        this.parent = rawBubble.parent;
        this.subtype = rawBubble.subtype;
        this.chain = rawBubble.chain;
        this.chainStep = rawBubble.chain_step;
        this.size = rawBubble.size;
    }
}

export class BubbleEndRecord extends NodeRecord {
    constructor(rawBubbleEnd) {
        super(rawBubbleEnd, "bubble:end");
        this.subtype = rawBubbleEnd.subtype;
        this.chainEnd = rawBubbleEnd.chain_end;
        this.chain = rawBubbleEnd.chain;
        this.size = rawBubbleEnd.size;
    }
}

export class SegmentRecord extends NodeRecord {
    constructor(rawSegment) {
        super(rawSegment, "segment");
        this.insideBubble = rawSegment.inside_bubble;
        this.seq = rawSegment.seq;

    }
}
