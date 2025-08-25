import { updateSelectedInfo } from "../../../../ui/tabs/information-panel.js";
import { faLabel } from '../selection-utils.js';
import { numberSelected, getSelected } from '../selection-state.js';
import { getGraphCoordinates } from "../../../graph-data/graph-state.js";

export function generateSelectedInfo(){
    const info = {};

    const coords = getGraphCoordinates();
    info.genome = coords.genome || '';
    info.chromosome = coords.chromosome || '';

    if (numberSelected() !== 1) {
        info.id = '';
        info.type = '';
        info.start = '';
        info.end = '';
        info.position = '';
        info.length = '';
        info.seq = '';
        info.nInside = '';
        updateSelectedInfo(info);
    }

    const node = getSelected()[0];

    info.id = faLabel(node.id) || '';
    info.type = node.type || '';
    info.start = node.start != null ? node.start : '?';
    info.end = node.end != null ? node.end : '?';
    info.position = node.position || '';
    info.length = node.length || '?';
    info.seq = node.seq || 'N?';
    info.nInside = node.nInside || '';

    updateSelectedInfo(info);
}