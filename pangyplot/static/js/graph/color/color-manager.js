import { setNodeColors, setLinkColor, setBackgroundColor, setColorStyle, colorState } from './color-state.js';
import { updateLegend } from './legend/legend-manager.js';
import eventBus from '@event-bus';

eventBus.subscribe('color:updated', ({ type, color1, color2, color3, color, style }) => {
    if (type === "node") setNodeColors(color1, color2, color3);
    else if (type === "link") setLinkColor(color);
    else if (type === "background") setBackgroundColor(color);
    else if (type === "style") setColorStyle(style);

    updateLegend();
});
