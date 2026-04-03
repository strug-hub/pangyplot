// Scan raw links for source→sink connections within the same bubble.
// These are self-loops (filtered by deserializeLinks) but signal that the bubble is an indel.
// Segments can be shared between sibling bubbles (one's sink = next's source),
// so we map each segment to all bubbles that claim it.
export function detectIndelBubbles(rawLinks, bubbleRecords) {
    // Map segId (s-prefixed) → [{record, role}]
    const segToBubbles = new Map();
    for (const record of bubbleRecords) {
        for (const segId of record.sourceSegs) {
            if (!segToBubbles.has(segId)) segToBubbles.set(segId, []);
            segToBubbles.get(segId).push({ record, role: "source" });
        }
        for (const segId of record.sinkSegs) {
            if (!segToBubbles.has(segId)) segToBubbles.set(segId, []);
            segToBubbles.get(segId).push({ record, role: "sink" });
        }
    }

    for (const rawLink of rawLinks) {
        const srcEntries = segToBubbles.get(String(rawLink.source));
        const tgtEntries = segToBubbles.get(String(rawLink.target));
        if (!srcEntries || !tgtEntries) continue;

        // Check if any single bubble claims both endpoints with different roles
        for (const src of srcEntries) {
            for (const tgt of tgtEntries) {
                if (src.record === tgt.record && src.role !== tgt.role) {
                    src.record.isIndel = true;
                }
            }
        }
    }
}
