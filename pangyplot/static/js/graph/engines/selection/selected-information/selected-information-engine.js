import { updateSelectedInfo } from "../../../../ui/tabs/information-panel.js";
import { faLabel } from '../../../../utils/node-label.js';
import eventBus from '../../../../utils/event-bus.js';

const blankInfo = {
    id: '',
    type: '',
    start: '',
    end: '',
    position: '',
    length: '',
    seq: '',
    nInside: ''
};

function generateSelectedInfo(forceGraph){
    const info = { ...blankInfo };

    const coords = forceGraph.coords;
    info.genome = coords.genome || '';
    info.chromosome = coords.chromosome || '';

    if (forceGraph.selected.size !== 1) {
        updateSelectedInfo(info);
        return;
    }

    const node = forceGraph.selected.getAnyNode();
    if (!node) {
        updateSelectedInfo(info);
        return;
    }
    
    info.id = faLabel(node.id) || '';
    info.type = node.type || '';
    info.start = node.start != null ? node.start : '?';
    info.end = node.end != null ? node.end : '?';
    info.position = node.position || '';
    info.length = node.record.seqLength || '?';
    info.seq = node.seq || 'N?';
    info.nInside = node.record.size || '';

    updateSelectedInfo(info);
}

export default function setUpSelectedInformationEngine(forceGraph){

    eventBus.subscribe('graph:selected-changed', () => {
        generateSelectedInfo(forceGraph);
    });
}