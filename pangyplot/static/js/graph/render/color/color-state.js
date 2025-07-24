export const colorState = {
    highlightNode: "#FAB3AE",
    selectedNode: "#F44336",
    highlightLink: "#FF0000",
    background: "#373737",

    nodeColors: ["#0762E5", "#F2DC0F", "#FF6700"],
    linkColor: "#969696",

    nullColor: "#3C5E81",

    style: "node_type"
};

export function setNodeColors(c1, c2, c3) {
    colorState.nodeColors = [c1, c2, c3];
}

export function setLinkColor(color) {
    colorState.linkColor = color;
}

export function setBackgroundColor(color) {
    colorState.background = color;
}

export function setColorStyle(style) {
    colorState.style = style;
}

export function setHighlightNodeColor(color) {
    colorState.highlightNode = color;
}

export function setSelectedNodeColor(color) {
    colorState.selectedNode = color;
}