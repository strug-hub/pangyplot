import { colorState } from './color-state.js';
import { getGradientColor } from './color-utils.js';

export function getLinkColor(link){

    if (link.type === "link"){
        return colorState.linkColor;
    }

    switch (colorState.style) {
        case "node_type":
            return colorByType(link.type);        
        case "bubble_size":
            return colorBySize(link.source.size);
        case "node_length":
            return colorByLength(link.source.seqLen);
        case "ref_alt":
            return colorByRef(link);
        case "gc_content":
            return colorByGC(link.source.gcCount, link.source.seqLen);
        case "position":
            return colorByPosition(link.source.start, link.source.end);  
        case "solid":
            return colorState.nodeColors[0];
        default:
            return colorByType(link.type);        
    }
}

export function getNodeColor(node){

    switch (colorState.style) {
        case "node_type":
            return colorByType(node.type);
        case "bubble_size":
            return colorBySize(node.size);
        case "node_length":
            return colorByLength(node.seqLen);
        case "ref_alt":
            return colorByRef(node);
        case "gc_content": 
            return colorByGC(node.gcCount, node.seqLen);
        case "position":
            return colorByPosition(node.start, node.end);
        case "solid":
                return colorState.nodeColors[0]; 
        default:
            return colorByType(node.type);
    }
}

function colorByType(type){
    switch (type) {
        case "segment":
            return colorState.nodeColors[0];
        case "bubble":
            return colorState.nodeColors[1];
        case "bubble:end":
            return colorState.nodeColors[2];
        case "chain":
            return colorState.nodeColors[2];
        case "link":
            return colorState.linkColor;
        default:
            return colorState.nullColor;
    }    
}

function colorBySize(size){
    const low = 0;
    const high = 12;

    if (size == null || isNaN(size) || size <= 0) {
        return colorState.nullColor;
    }

    const color = getGradientColor(size, low, high, colorState.nodeColors[0]);

    return color;
}

function colorByGC(count, total){
    if (count == null || isNaN(count) || count < 0) {
        return colorState.nullColor;
    } if (total == null || isNaN(total) || total <= 0) {
        return colorState.nullColor;
    }

    const pcGC = count/total;
    const color = getGradientColor(pcGC, 0, 1, colorState.nodeColors[0]);

    return color;
}

function colorByPosition(start, end){
    //TODO
    return colorState.nullColor;
    if ( start == null || isNaN(start) || end == null || isNaN(end)) {
        return colorState.nullColor;
    }
    const position = (start+end)/2;
    return getGradientColor(position, GRAPH_START_POS, GRAPH_END_POS, colorState.nodeColors[0]);
}

function colorByRef(obj){
    return obj.isRef ? colorState.nodeColors[0] : colorState.nodeColors[2];
}

function colorByLength(length) {
    const low = 0;
    const high = 5;

    if (length == null || isNaN(length) || length <= 0) {
        return colorState.nullColor;
    }

    const logLength = Math.log10(length);
    const color = getGradientColor(logLength, low, high, colorState.nodeColors[0]);

    return color;
}

  