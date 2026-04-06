import { colorState } from '../color-state.js';
import { setLegendItems, setLegendTitle } from './graph-legend.js';

export function updateLegend() {
    
    let items = [];
    let title = "";
  
    switch (colorState.style) {
      case "node_type":
        title = "Node Type";
        items = [
          { label: "Segment", color: colorState.nodeColors[0] },
          { label: "Bubble", color: colorState.nodeColors[1] },
          { label: "Bubble Chain", color: colorState.nodeColors[2] }
        ];
        break;
      case "bubble_size":
        title = "Bubble Size";
        items = [
          { label: "Small", color: colorState.nodeColors[0] },
          { label: "Medium", color: colorState.nodeColors[1] },
          { label: "Large", color: colorState.nodeColors[2] }
        ];
        break;
      case "node_length":
        title = "Node Length";
        items = [
          { label: "Short", color: colorState.nodeColors[0] },
          { label: "Medium", color: colorState.nodeColors[1] },
          { label: "Long", color: colorState.nodeColors[2] },
          { label: "Undefined", color: colorState.nullColor }

        ];
        break;
      case "ref_alt":
        title = "Ref/Alt";
        items = [
          { label: "Reference", color: colorState.nodeColors[0] },
          { label: "Alternate", color: colorState.nodeColors[2] }
        ];
        break;
      case "gc_content":
        title = "GC Content";
        items = [
          { label: "Low GC%", color: colorState.nodeColors[0] },
          { label: "Medium", color: colorState.nodeColors[1] },
          { label: "High GC%", color: colorState.nodeColors[2] },
          { label: "Unknown", color: colorState.nullColor }
        ];
        break;
      case "position":
        title = "Position Range";
        items = [
          { label: "Start", color: colorState.nodeColors[0] },
          { label: "Middle", color: colorState.nodeColors[1] },
          { label: "End", color: colorState.nodeColors[2] },
          { label: "No position", color: colorState.nullColor }
        ];
        break;
      case "solid":
        title = "Uniform Color";
        items = [
          { label: "Node", color: colorState.nodeColors[0] }
        ];
        break;
      default:
        title = "";
        items = [];
        break;
    }
  
    setLegendTitle(title);
    setLegendItems(items);
  }
  