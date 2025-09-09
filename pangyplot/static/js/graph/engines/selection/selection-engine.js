import setUpMultiSelectionEngine from './multi-selection/multi-selection-engine.js';
import setUpHoverEngine from './hover/hover-engine.js';
import setUpSingleSelectEngine from './single-selection/single-selection-engine.js';
import setUpSelectedInformationEngine from './selected-information/selected-information-engine.js';
import setUpCancelSelectionEngine from './cancel-selection/cancel-selection-engine.js';
import { flipChainMode } from './selection-state.js';
import eventBus from '../../../utils/event-bus.js';
import NodeSet from '../../utils/node-set.js';


export default function setUpSelectionEngine(forceGraph) {

    forceGraph.highlighted = new NodeSet("highlighted");
    forceGraph.selected = new NodeSet("selected");

    forceGraph.setSelected = function (nodes) {
        if (nodes == null) {
            this.selected.clear();
        } else {
            if (this.selected.contains(nodes)) return;
            this.selected.clear();
            this.selected.addAll(nodes);
        }
        eventBus.publish('graph:selected-changed', nodes);
    };

    forceGraph.setHighlighted = function (nodes) {
        if (nodes == null) {
            this.highlighted.clear();
        } else {
            if (this.highlighted.contains(nodes)) return;
            this.highlighted.clear();
            this.highlighted.addAll(nodes);
        }
        eventBus.publish('graph:highlighted-changed', nodes);
    };

    setUpHoverEngine(forceGraph);
    setUpSingleSelectEngine(forceGraph);
    setUpMultiSelectionEngine(forceGraph);
    setUpCancelSelectionEngine(forceGraph);
    setUpSelectedInformationEngine(forceGraph);

    forceGraph.element.addEventListener('keydown', (event) => {
        if (event.key === 'c' || event.key === 'C') {
            event.preventDefault();
            flipChainMode();
        }
    });
}