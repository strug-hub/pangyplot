import { updateSelectedInfo } from "../../../../ui/tabs/information-panel.js";
import { faLabel } from '../../../../utils/node-label.js';
import { numberSelected, getSelectedNodeSet } from '../selection-state.js';
import forceGraph from "../../../force-graph.js";

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

    const coords = forceGraph.coords;
    info.genome = coords.genome || '';
    info.chromosome = coords.chromosome || '';

    if (numberSelected() !== 1) {
        updateSelectedInfo(info);
        return;
    }

    const selectedNodeSet = getSelectedNodeSet();
    if (selectedNodeSet.isEmpty()) {
        updateSelectedInfo(info);
        return;
    }
    const node = selectedNodeSet.getAnyNode();
    console.log(node)
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