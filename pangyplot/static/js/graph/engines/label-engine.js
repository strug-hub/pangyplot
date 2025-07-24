const LABEL_FONT_SIZE=80;
const LABEL_FILL_COLOR = "#FFFFFF";
const LABEL_OUTLINE_COLOR= "#000000";

function labelEngineUpdate(ctx, forceGraph, svg=false){
    const zoomFactor = ctx.canvas.__zoom["k"];

    const labelGroups = {};

    forceGraph.graphData().nodes.forEach(node => {
        if (node.label && node.isVisible && node.isDrawn) {
            if (!labelGroups[node.nodeId]) {
            labelGroups[node.nodeId] = { label: node.label, nodes: [] };
          }

          labelGroups[node.nodeId].nodes.push(node);
        }
      });

      const properties = []
      Object.keys(labelGroups).forEach(nodeId => {
        const group = labelGroups[nodeId];
        const { label, nodes } = group;
    
        const bounds = findNodeBounds(nodes);
        const x = bounds.x + bounds.width/2;
        const y = bounds.y + bounds.height/2;
        const size = Math.max(LABEL_FONT_SIZE, LABEL_FONT_SIZE * (1 / zoomFactor / 10));
        
        if (svg){
          properties.push(
            {
                text: label,
                x: x,
                y: y,
                fontSize: LABEL_FONT_SIZE,
                strokeWidth: 2,
                stroke: LABEL_OUTLINE_COLOR,
                color: LABEL_FILL_COLOR
            });
        } else {
          drawText(label, ctx, x, y, size, LABEL_FILL_COLOR, LABEL_OUTLINE_COLOR, size / 8);
        }
    });

    return properties;
}

