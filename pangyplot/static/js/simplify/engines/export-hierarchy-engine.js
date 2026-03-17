// Q-key: export force graph state to a canonical text file for diff with core viewer.
// Format is identical between core and simplify exports.

import { getForceNodes, getForceLinks } from '../detail/data/force-data.js';
import { saveHistory } from '../../utils/pop-history.js';

export function setupExportHierarchyEngine() {
    window.addEventListener('keydown', e => {
        if (e.key === 'q' || e.key === 'Q') {
            e.preventDefault();
            if (!confirm('Overwrite saved history and hierarchy files?')) return;
            exportHierarchy('hierarchy_simplify.txt');
            exportHierarchy('history/hierarchy_simplify.txt');
            saveHistory('simplify');
        }
    });
}

function exportHierarchy(filename) {
    const nodes = getForceNodes();
    const links = getForceLinks();
    const lines = buildCanonicalExport(nodes, links);

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

    // Section 1: Nodes — skip phantom/interchain nodes
    const realNodes = uniqueNodes.filter(n => n.type === 'bubble' || n.type === 'segment');
    const bubbles = realNodes.filter(n => n.type === 'bubble');
    const segments = realNodes.filter(n => n.type === 'segment');
    lines.push(`--- Nodes (${realNodes.length}) ---`);
    lines.push(`Bubbles: ${bubbles.length}, Segments: ${segments.length}`);
    for (const n of realNodes) {
        const record = n.record || {};
        const extra = [];
        if (record.popData) extra.push('POPPED');
        if (record.sourceSegs?.length) extra.push(`src=[${record.sourceSegs.join(',')}]`);
        if (record.sinkSegs?.length) extra.push(`snk=[${record.sinkSegs.join(',')}]`);
        const suffix = extra.length ? ` (${extra.join(', ')})` : '';
        lines.push(`  ${n.id} [${n.type}]${suffix}`);
    }
    lines.push('');

    // Section 2: Links — undirected, normalized (smaller ID first), skip phantom links
    const linkSet = new Set();
    for (const link of links) {
        // Skip kink-internal links
        if (link.isKinkLink || link.class === 'node') continue;
        const src = link.sourceId || (typeof link.source === 'object' ? link.source.id : link.source);
        const tgt = link.targetId || (typeof link.target === 'object' ? link.target.id : link.target);
        if (!src || !tgt) continue;
        // Skip phantom/interchain nodes
        if (String(src).startsWith('phantom') || String(tgt).startsWith('phantom')) continue;
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
