// Q-key: export force graph state to a canonical text file for diff with simplify viewer.
// Format is identical between core and simplify exports.

import { nodeRecordLookup } from '../../data/records/records-manager-implementation.js';
import { saveHistory } from '../../../utils/pop-history.js';
import { replayHistory } from '../bubble-pop/bubble-pop.js';

export default function setUpExportHierarchyEngine(forceGraph) {
    forceGraph.element.addEventListener('keydown', event => {
        if (event.key === 'q' || event.key === 'Q') {
            event.preventDefault();
            if (!confirm('Overwrite saved history and hierarchy files?')) return;
            exportHierarchy(forceGraph, 'hierarchy_core.txt');
            exportHierarchy(forceGraph, 'history/hierarchy_core.txt');
            saveHistory('core');
        }
        if ((event.key === 'r' || event.key === 'R') && !event.repeat) {
            replayHistory(forceGraph);
        }
    });
}

function exportHierarchy(forceGraph, filename) {
    const graphData = forceGraph.graphData();
    const lines = buildCanonicalExport(graphData.nodes, graphData.links);

    const text = lines.join('\n');
    fetch('/debug/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content: text }),
    }).then(() => console.log(`Saved ${filename} (${lines.length} lines)`))
      .catch(e => console.warn('Export failed:', e));
}

function buildCanonicalExport(nodes, links) {
    const lines = [];

    // Deduplicate nodes (skip kink duplicates, keep idx=0 only)
    const seen = new Set();
    const uniqueNodes = [];
    for (const n of nodes) {
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        uniqueNodes.push(n);
    }

    // Sort nodes by ID
    uniqueNodes.sort((a, b) => {
        const aNum = parseInt(a.id.replace(/\D/g, ''));
        const bNum = parseInt(b.id.replace(/\D/g, ''));
        if (a.id[0] !== b.id[0]) return a.id < b.id ? -1 : 1;
        return aNum - bNum;
    });

    // Section 1: Nodes
    const bubbles = uniqueNodes.filter(n => n.type === 'bubble');
    const segments = uniqueNodes.filter(n => n.type === 'segment');
    lines.push(`--- Nodes (${uniqueNodes.length}) ---`);
    lines.push(`Bubbles: ${bubbles.length}, Segments: ${segments.length}`);
    for (const n of uniqueNodes) {
        const record = n.record || {};
        const extra = [];
        if (record.popData) extra.push('POPPED');
        if (record.sourceSegs?.length) extra.push(`src=[${record.sourceSegs.join(',')}]`);
        if (record.sinkSegs?.length) extra.push(`snk=[${record.sinkSegs.join(',')}]`);
        const suffix = extra.length ? ` (${extra.join(', ')})` : '';
        lines.push(`  ${n.id} [${n.type}]${suffix}`);
    }
    lines.push('');

    // Section 2: Links — undirected, normalized (smaller ID first)
    const linkSet = new Set();
    for (const link of links) {
        if (link.class !== 'link') continue;
        const src = link.sourceId;
        const tgt = link.targetId;
        if (!src || !tgt) continue;
        const pair = src < tgt ? `${src} -- ${tgt}` : `${tgt} -- ${src}`;
        linkSet.add(pair);
    }
    const sortedLinks = [...linkSet].sort();
    lines.push(`--- Links (${sortedLinks.length}) ---`);
    for (const l of sortedLinks) {
        lines.push(`  ${l}`);
    }

    return lines;
}
