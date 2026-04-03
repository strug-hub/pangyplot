// Shared utility: deserialize an API subgraph (nodes + links) into
// force-ready D3 nodes, links, and a recordMap.
// Used by both core pop and simplify chain/bubble pop adapters.

import { deserializeNodes } from './deserialize-nodes.js';
import { createNodeElements, createLinkElements } from './deserializer-element.js';
import { detectIndelBubbles } from './indel-detection.js';
import { LinkRecord } from '../objects/link-record.js';

/**
 * @param {Object} apiData - { nodes: [...], links: [...] }
 * @param {Object} [options]
 * @param {Object} [options.tag]         - properties applied to every node/link (e.g. { chainId })
 * @param {boolean} [options.detectIndels] - run indel detection (default true)
 * @param {Function} [options.linkResolver] - (segId) => NodeRecord|null for cross-batch resolution
 * @param {Map} [options.extraRecords]   - additional records for link endpoint resolution
 * @returns {{ nodes: D3Node[], links: D3Link[], recordMap: Map<string, NodeRecord> }}
 */
export function deserializeSubgraph(apiData, options = {}) {
    const {
        tag = {},
        detectIndels = true,
        linkResolver = null,
        extraRecords = null,
    } = options;

    const records = deserializeNodes(apiData.nodes);

    if (detectIndels) {
        const bubbleRecords = records.filter(r => r.type === 'bubble');
        detectIndelBubbles(apiData.links, bubbleRecords);
    }

    const allNodes = [];
    const allLinks = [];
    const recordMap = new Map();

    for (const record of records) {
        const els = createNodeElements(record);
        record.elements = els;
        recordMap.set(record.id, record);

        for (const node of els.nodes) {
            node.radius = node.width / 2;
            node.recordId = node.id;
            node.seqLength = record.seqLength;
            Object.assign(node, tag);
            allNodes.push(node);
        }

        for (const link of els.links) {
            link.isKinkLink = link.class === 'node';
            Object.assign(link, tag);
            allLinks.push(link);
        }
    }

    // Build lookup for link resolution: local records + extras
    const linkLookup = extraRecords
        ? new Map([...extraRecords, ...recordMap])
        : recordMap;

    // Resolve inter-node links
    for (const rawLink of apiData.links) {
        const sId = typeof rawLink.source === 'string' ? rawLink.source : `s${rawLink.source}`;
        const tId = typeof rawLink.target === 'string' ? rawLink.target : `s${rawLink.target}`;

        let sourceRecord = linkLookup.get(sId);
        let targetRecord = linkLookup.get(tId);

        // Fall back to external resolver (e.g. viewState) if provided
        if (!sourceRecord && linkResolver) sourceRecord = linkResolver(sId);
        if (!targetRecord && linkResolver) targetRecord = linkResolver(tId);

        if (!sourceRecord || !targetRecord) continue;

        // Promote b→b links to chain type (matching core's deserializeChainLinks)
        const isBubblePair = sourceRecord.type === 'bubble' && targetRecord.type === 'bubble';
        const resolved = isBubblePair
            ? { ...rawLink, type: 'chain', source: sourceRecord.id, target: targetRecord.id }
            : rawLink;
        const linkRecord = new LinkRecord(resolved, sourceRecord, targetRecord);
        const els = createLinkElements(linkRecord);
        for (const link of els.links) {
            link.isKinkLink = false;
            // Tag with GFA seg IDs for synonymous link matching
            link.sourceSeg = sId.replace(/^s/, '');
            link.targetSeg = tId.replace(/^s/, '');
            Object.assign(link, tag);
            allLinks.push(link);
        }
    }

    return { nodes: allNodes, links: allLinks, recordMap };
}
