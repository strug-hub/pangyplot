import { RightClickMenu } from './right-click-menu.js';
import { popGroupOfBubbles } from '../bubble-pop/bubble-pop-engine.js';
import { exportGraphToPng } from '../../render/download/render-png.js';
import { exportGraphToSvg } from '../../render/download/render-svg.js';
import { getGraphCoordinates } from '../../graph-data/graph-state.js';

var menu = null;

export function populateOptions(forceGraph) {
    menu = new RightClickMenu(forceGraph);

    // Node-specific actions
    menu.addOption('burst', 'Pop nodes', 'node', nodes => {
        popGroupOfBubbles(nodes);
    });

    menu.addOption('dna', 'Show Sequence', 'node', nodes => {
        const nchar = 25;
        nodes.forEach(node => {
            const fullSequence = node.data.sequence || '';
            const truncated = fullSequence.slice(0, nchar);
            node.label = truncated + (fullSequence.length > nchar ? '...' : '');
        });
    });

    menu.addOption('pen', 'Add Custom Label', 'node', nodes => {
        const label = prompt('Enter a custom label for the nodes:');
        if (label) nodes.forEach(node => node.label = label);
    });

    menu.addOption('trash-can', 'Clear Labels', 'node', nodes => {
        nodes.forEach(node => node.label = null);
    });

    menu.addOption('lock-open', 'Unlock nodes', 'node', nodes => {
        nodes.forEach(node => {
            node.fx = null;
            node.fy = null;
        });
    });

    menu.addOption('lock', 'Lock nodes', 'node', nodes => {
        nodes.forEach(node => {
            node.fx = node.x;
            node.fy = node.y;
        });
    });

    // General actions
    menu.addOption('arrows-to-circle', 'Recenter Graph', 'general', () => {
        forceGraph.zoomToFit(200, 10, () => true);
    });

    menu.addOption('download', 'Download GFA', 'general', () => {
        const coords = getGraphCoordinates();
        const url = new URL('/gfa', window.location.origin);
        for (const [key, val] of Object.entries(coords)) {
            url.searchParams.set(key, val);
        }
        window.location.href = url.toString();
    });

    menu.addOption('download', 'Download PNG', 'general', () => {
        exportGraphToPng(forceGraph);
    });

    menu.addOption('download', 'Download SVG', 'general', () => {
        exportGraphToSvg(forceGraph);
    });

    return menu;
}

export default function setupRightClickMenu(forceGraph, canvasElement) {
    populateOptions(forceGraph);

    canvasElement.addEventListener('contextmenu', event => {
        event.preventDefault();
        menu.showMenu(event.pageX, event.pageY);
    });
}