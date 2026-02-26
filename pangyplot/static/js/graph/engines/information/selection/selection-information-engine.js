import { updateSelectionInfo } from "../../../../ui/tabs/information-panel.js";
import { faLabel } from '../../../../utils/node-label.js';
import eventBus from '../../../../utils/event-bus.js';
import appState from '../../../../app-state.js';

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

function generateSelectionInfo(){
    const info = { ...blankInfo };

    const coords = appState.coords;
    info.genome = coords.genome || '';
    info.chromosome = coords.chromosome || '';

    if (appState.selected.size !== 1) {
        updateSelectionInfo(info);
        return;
    }

    const node = appState.selected.getAnyNode();
    if (!node) {
        updateSelectionInfo(info);
        return;
    }

    info.id = faLabel(node.id) || '';
    info.range = String(node.record.ranges) || '';
    info.type = node.type || '';
    info.start = node.start != null ? node.start : '?';
    info.end = node.end != null ? node.end : '?';
    info.position = node.position || '';
    info.length = node.record.seqLength || '?';
    info.seq = node.record.seq || 'N?';
    info.nInside = node.record.inside.size || '';

    updateSelectionInfo(info);
}

export default function setUpSelectionInformationEngine(forceGraph){

    //todo: allow for multiple selection
    eventBus.subscribe('graph:selection-changed', () => {
        generateSelectionInfo();
    });
}
