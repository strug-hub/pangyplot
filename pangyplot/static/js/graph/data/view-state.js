// viewState maps segment IDs to the NodeRecord that visually represents them.
// If a segment's bubble is collapsed, it maps to that bubble's BubbleRecord.
// If resolve() returns null, the segment is visible as its own segment node.

class ViewState {
    constructor() {
        // Map<string segId, NodeRecord> — the collapsed bubble that owns this seg
        this.segmentToNode = new Map();
    }

    clear() {
        this.segmentToNode.clear();
    }

    // Called for each bubble on /select response and when re-collapsing.
    // Registers source_segs, sink_segs, and inside_segs as all mapping to bubbleRecord.
    // source_segs win over sink_segs for shared boundary segments (last write wins).
    registerBubble(bubbleRecord, sourceSegs, sinkSegs, insideSegs = []) {
        for (const segId of insideSegs) {
            this.segmentToNode.set(String(segId), bubbleRecord);
        }
        for (const segId of sinkSegs) {
            this.segmentToNode.set(String(segId), bubbleRecord);
        }
        for (const segId of sourceSegs) {
            this.segmentToNode.set(String(segId), bubbleRecord);
        }
    }

    // Called after /pop; remaps all segs owned by the old bubble away.
    // bubbleRecord: the NodeRecord of the bubble being expanded
    // sourceSegs/sinkSegs: the popped bubble's boundary segment IDs
    // childBubbles: array of {id, source_segs, sink_segs, inside_segs} from /pop response
    // getRecord: (serializedId) => NodeRecord
    expand(bubbleRecord, sourceSegs, sinkSegs, childBubbles, getRecord) {
        // Unmap ALL segs that currently point to the old bubble record
        // (includes boundary segs + inside segs)
        for (const [segId, record] of [...this.segmentToNode]) {
            if (record === bubbleRecord) this.segmentToNode.delete(segId);
        }
        // Register child bubble segments (source_segs win over sink_segs and inside_segs)
        for (const child of childBubbles) {
            const childRecord = getRecord("b" + child.id);
            if (!childRecord) continue;
            this.registerBubble(childRecord, child.source_segs, child.sink_segs, child.inside_segs || []);
        }
    }

    // Reverses expand: collapses a bubble back, removing child mappings.
    // bubbleRecord: the NodeRecord of the bubble being collapsed
    // sourceSegs/sinkSegs: the bubble's boundary segment IDs
    // insideSegs: the bubble's inside segment IDs
    // childBubbles: array of {id, source_segs, sink_segs, inside_segs} to unmap
    collapse(bubbleRecord, sourceSegs, sinkSegs, insideSegs, childBubbles) {
        // Remove all child bubble segment mappings
        for (const child of childBubbles) {
            for (const segId of [...(child.source_segs || []), ...(child.sink_segs || []), ...(child.inside_segs || [])]) {
                this.segmentToNode.delete(String(segId));
            }
        }
        // Re-register this bubble's segments
        this.registerBubble(bubbleRecord, sourceSegs, sinkSegs, insideSegs);
    }

    // Returns the NodeRecord that visually represents this segment,
    // or null if the segment is visible as itself.
    // segId should be a plain integer or string (without "s" prefix).
    resolve(segId) {
        return this.segmentToNode.get(String(segId)) || null;
    }
}

const viewState = new ViewState();
export default viewState;
