import { updateSelectedInfo } from "../../../../ui/tabs/information-panel.js";
import { faLabel } from '../selection-utils.js';
import { numberSelected, getSelected } from '../selection-state.js';
import { getGraphCoordinates } from "../../../graph-data/graph-state.js";

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

export function generateSelectedInfo(){
    const info = { ...blankInfo };

    const coords = getGraphCoordinates();
    info.genome = coords.genome || '';
    info.chromosome = coords.chromosome || '';

    if (numberSelected() !== 1) {
        updateSelectedInfo(info);
        return;
    }

    const selected = getSelected();
    if (selected == null) {
        updateSelectedInfo(info);
        return;
    }
    const node = selected[0];
    
    info.id = faLabel(node.id) || '';
    info.type = node.type || '';
    info.start = node.start != null ? node.start : '?';
    info.end = node.end != null ? node.end : '?';
    info.position = node.position || '';
    info.length = node.element.seqLength || '?';
    info.seq = node.seq || 'N?';
    info.nInside = node.element.size || '';

    updateSelectedInfo(info);
}