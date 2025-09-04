import { isPanZoomMode } from './pan-zoom-engine.js';
import { addRotation } from '../../graph-data/graph-state.js';

// TODO: but a challenge is where the "center" is to apply the rotation
// if we just rotate at the end (ie during render) I think everything else will just work??

export default function setUpRotationEngine(forceGraph, graphElement) {

    graphElement.addEventListener('mousedown', (event) => {
        if (event.button === 1) { // 1 is the middle mouse button
            if (isPanZoomMode()) {
                event.preventDefault();
                const delta = Math.sign(event.deltaY);
                forceGraph.zoom(delta);
            }
        }
    });

}
