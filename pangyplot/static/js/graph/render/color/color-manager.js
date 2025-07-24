import { setNodeColors, setLinkColor, setBackgroundColor, setColorStyle, colorState } from './color-state.js';
import { updateLegend } from './legend/legend-manager.js';

//TODO switch to eventBus
document.addEventListener('updateColor', function(event) {
    const { type, color1, color2, color3, color, style } = event.detail;

    if (type === "node") setNodeColors(color1, color2, color3);
    else if (type === "link") setLinkColor(color);
    else if (type === "background") setBackgroundColor(color);
    else if (type === "style") setColorStyle(style);

    updateLegend();
});

export function updateBackgroundColor(forceGraph) {
    forceGraph.backgroundColor(colorState.background);
}
