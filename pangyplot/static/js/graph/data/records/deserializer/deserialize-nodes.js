import { SegmentRecord, BubbleRecord } from "../objects/node-record.js";

export function deserializeNodes(rawNodes) {
    const records = [];
    for (const rawNode of rawNodes) {
        if (rawNode.type === "segment") {
            records.push(new SegmentRecord(rawNode));
        } else if (rawNode.type === "bubble") {
            records.push(new BubbleRecord(rawNode));
        }
    }
    return records;
}
