import { updateSelectionInfo } from "../../../../ui/tabs/information-panel.js";
import { faLabel } from '../../../../utils/node-label.js';
import eventBus from '@event-bus';
import appState from '../../../app-state.js';

function formatCoordinates(ranges, coords) {
    if (!ranges || ranges.length === 0) return null;
    const allStarts = ranges.map(r => r[0]);
    const allEnds = ranges.map(r => r[1]);
    const start = Math.min(...allStarts);
    const end = Math.max(...allEnds);
    return `${coords.genome || ''}#${coords.chromosome || ''}:${start.toLocaleString()}-${end.toLocaleString()}`;
}

function formatGC(gcCount, seqLength) {
    if (gcCount == null || seqLength == null || seqLength === 0) return null;
    return ((gcCount / seqLength) * 100).toFixed(1) + '%';
}

function generateSelectionInfo() {
    if (appState.selected.size !== 1) {
        updateSelectionInfo(null);
        return;
    }

    const node = appState.selected.getAnyNode();
    if (!node) {
        updateSelectionInfo(null);
        return;
    }

    const record = node.record;
    const coords = appState.coords;

    const rawId = node.id.slice(1).split(':')[0];

    const base = {
        id: faLabel(node.id) || '',
        rawId: rawId,
        type: record.type,
        coordinates: formatCoordinates(record.ranges, coords),
        length: record.seqLength,
        gcPercent: formatGC(record.gcCount, record.seqLength),
        nCount: record.nCount,
    };

    if (record.type === 'segment') {
        updateSelectionInfo({
            ...base,
            seq: record.seq || '',
        });
    } else if (record.type === 'bubble') {
        updateSelectionInfo({
            ...base,
            subtype: record.subtype,
            chain: record.chain,
            chainStep: record.chainStep,
            size: record.size,
            parent: record.parent,
            siblings: record.siblings,
        });
    } else {
        updateSelectionInfo(base);
    }
}

export default function setUpSelectionInformationEngine(forceGraph) {
    eventBus.subscribe('graph:selection-changed', () => {
        generateSelectionInfo();
    });
}
