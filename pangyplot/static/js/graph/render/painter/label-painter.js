import { colorState } from "../color/color-state.js";
import { findNodeBounds } from "../../utils/node-utils.js";
import { drawText } from "./painter-utils.js";
import { getZoomFactor } from "../../graph-data/graph-state.js";
import { getTextSizeAdjustment } from "../render-settings.js";

const LABEL_FONT_SIZE=60;

export default function labelPainter(ctx, forceGraph, svg=false){
    const zoomFactor = getZoomFactor();

    const labelGroups = {};

    forceGraph.graphData().nodes.forEach(node => {
        if (node.label && node.isVisible && node.isDrawn) {
            if (!labelGroups[node.id]) {
            labelGroups[node.id] = { label: node.label, nodes: [] };
          }

          labelGroups[node.id].nodes.push(node);
        }
      });

      const properties = []
      Object.keys(labelGroups).forEach(id => {
        const group = labelGroups[id];
        const { label, nodes } = group;
    
        const bounds = findNodeBounds(nodes);
        const x = bounds.x + bounds.width/2;
        const y = bounds.y + bounds.height/2;
        var size = Math.max(LABEL_FONT_SIZE, LABEL_FONT_SIZE * (1 / zoomFactor / 10));
        const textSizeAdjustment = getTextSizeAdjustment();
        size = size + textSizeAdjustment;

        if (svg){
          properties.push(
            {
                text: label,
                x: x,
                y: y,
                fontSize: LABEL_FONT_SIZE + textSizeAdjustment,
                strokeWidth: 2,
                stroke: colorState.textOutline,
                color: colorState.textFill
            });
        } else {
          drawText(label, ctx, x, y, size, colorState.textFill, colorState.textOutline, size / 8);
        }
    });

    return properties;
}

