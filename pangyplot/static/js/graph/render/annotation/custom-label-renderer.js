import { labelPainter } from '../painter/label-painter.js'; 
import { findNodeBounds } from "../../utils/node-utils.js";

export function renderCustomLabels(ctx, forceGraph, svg=null){

    const labelGroups = {};

    forceGraph.graphData().nodes.forEach(node => {
        if (node.label && node.isVisible && node.isDrawn) {
            if (!labelGroups[node.id]) {
            labelGroups[node.id] = { label: node.label, nodes: [] };
          }

          labelGroups[node.id].nodes.push(node);
        }
      });

      Object.keys(labelGroups).forEach(id => {
        const group = labelGroups[id];
        const { label, nodes } = group;
    
        const bounds = findNodeBounds(nodes);
        const x = bounds.x + bounds.width/2;
        const y = bounds.y + bounds.height/2;

        labelPainter(ctx, label, x, y, "medium", null, null, svg);
    });


  }

