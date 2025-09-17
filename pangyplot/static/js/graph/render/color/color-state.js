export const colorState = {
    hoverColor: "#aca9a6",
    selectedColor: "#F44336",

    highlightColor: "#FAB3AE",
    highlightLink: "#FF0000",

    background: "#373737",

    nodeColors: ["#0762E5", "#F2DC0F", "#FF6700"],
    linkColor: "#969696",

    nullColor: "#3C5E81",

    textFill: "#FFFFFF",
    textOutline: "#000000",
    style: "node_type",

    smoothGC: false

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

export function setUpColorState(forceGraph) {
    document.getElementById("gcSmoothToggle").addEventListener("change", (event) => {
        colorState.smoothGC = event.target.checked;
    });

    document.getElementById("color-picker-node-1").addEventListener("change", (event) => {
        colorState.nodeColors[0] = event.target.value;
    });

    document.getElementById("color-picker-node-2").addEventListener("change", (event) => {
        colorState.nodeColors[1] = event.target.value;
    });

    document.getElementById("color-picker-node-3").addEventListener("change", (event) => {
        colorState.nodeColors[2] = event.target.value;
    });

    document.getElementById("color-picker-link").addEventListener("change", (event) => {
        colorState.linkColor = event.target.value;
    });

    document.getElementById("color-picker-bg").addEventListener("change", (event) => {
        colorState.background = event.target.value;
    });


}