import { LinkRecord } from "../objects/link-record.js";
import recordsManager from '../records-manager.js';
import viewState from '../../view-state.js';

// Deserialize raw s→s links using viewState to resolve visual endpoints.
// Both endpoints must resolve to different records; duplicates are deduplicated.
export function deserializeLinks(rawLinks) {
    const seen = new Set();
    const linkRecords = [];

    for (const rawLink of rawLinks) {
        // Raw links are always s→s: source/target are "sN" strings
        const srcSegId = String(rawLink.source);
        const tgtSegId = String(rawLink.target);

        const sourceRecord = viewState.resolve(srcSegId) || recordsManager.getNode(srcSegId);
        const targetRecord = viewState.resolve(tgtSegId) || recordsManager.getNode(tgtSegId);

        if (!sourceRecord || !targetRecord) continue;
        if (sourceRecord === targetRecord) continue;

        const isDel = rawLink.is_deletion || false;
        const key = isDel
            ? [sourceRecord.id, targetRecord.id].sort().join("|")
            : `${sourceRecord.id}|${targetRecord.id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // Use resolved IDs so sourceId/targetId match the visual nodes
        const resolvedLink = { ...rawLink, source: sourceRecord.id, target: targetRecord.id };
        linkRecords.push(new LinkRecord(resolvedLink, sourceRecord, targetRecord));
    }

    return linkRecords;
}

// Create chain links between sibling bubble pairs.
// Only creates forward links (A→next sibling) to avoid duplicates.
// Both records must already be in recordsManager with elements set.
export function deserializeChainLinks(nodeRecords) {
    const chainLinks = [];

    for (const record of nodeRecords) {
        if (!record.siblings) continue;
        const nextId = record.siblings[1];
        if (nextId === null || nextId === undefined) continue;

        const targetRecord = recordsManager.getNode("b" + nextId);
        if (!targetRecord || !targetRecord.elements) continue;

        const rawLink = {
            id: `chain_${record.id}_b${nextId}`,
            type: "chain",
            source: record.id,
            target: "b" + nextId,
            from_strand: "+",
            to_strand: "+",
        };
        chainLinks.push(new LinkRecord(rawLink, record, targetRecord));
    }

    return chainLinks;
}

// Remove regular links that connect the same bubble pair as a chain link.
// Chain links take priority since they carry chain ordering semantics.
export function deduplicateAgainstChainLinks(linkRecords, chainLinkRecords) {
    const chainPairs = new Set();
    for (const cl of chainLinkRecords) {
        // Chain links are directional (A→next), but GFA links can go either way
        chainPairs.add(`${cl.sourceId}|${cl.targetId}`);
        chainPairs.add(`${cl.targetId}|${cl.sourceId}`);
    }
    return linkRecords.filter(lr => !chainPairs.has(`${lr.sourceId}|${lr.targetId}`));
}
