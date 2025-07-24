export const colorState = {
    background: "#373737",
    highlightLink: "#FF0000",
    nullColor: "#3C5E81",
    nodeColors: ["#0762E5", "#F2DC0F", "#FF6700"],
    linkColor: "#969696",
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
