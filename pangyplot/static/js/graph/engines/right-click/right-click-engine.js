import { RightClickMenu } from './right-click-menu.js';
import { exportGraphToPng } from '../../render/download/render-png.js';
import { exportGraphToSvg } from '../../render/download/render-svg.js';
import appState from '../../app-state.js';

var menu = null;

export function populateOptions(forceGraph) {
    menu = new RightClickMenu(forceGraph);

    // Node-specific actions
    menu.addOption('burst', 'Pop nodes', 'node', nodes => {
        forceGraph.popBubbles(nodes);
    });

    menu.addOption('dna', 'Show Sequence', 'node', nodes => {
        const nchar = 25;
        nodes.forEach(node => {
            const fullSequence = node.record.seq || '';
            const truncated = fullSequence.slice(0, nchar);
            node.label = truncated + (fullSequence.length > nchar ? '...' : '');
        });
    });

    menu.addOption('pen', 'Add Custom Label', 'node', nodes => {
        const label = prompt('Enter a custom label for the nodes:');
        if (label) nodes.forEach(node => node.label = label);
    });

    menu.addOption('tag', 'Add Custom Annotation', 'node', nodes => {
        const name = prompt('Enter a custom annotation name for the nodes:');
        if (name) {
            forceGraph.createCustomAnnotation(name, nodes);
        }
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

    menu.addOption('file-export', 'Download GFA', 'general', async () => {
        const nodes = appState.selected.size > 0
            ? [...appState.selected]
            : forceGraph.graphData().nodes;

        const bubble_ids = [];
        const segment_ids = [];
        for (const node of nodes) {
            if (!node.record) continue;
            const rawId = Number(String(node.record.id).replace(/^[bs]/, ''));
            if (node.record.type === 'bubble') bubble_ids.push(rawId);
            else if (node.record.type === 'segment') segment_ids.push(rawId);
        }

        const resp = await fetch('/gfa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                genome: appState.coords.genome,
                chromosome: appState.coords.chromosome,
                bubble_ids,
                segment_ids,
            }),
        });
        if (!resp.ok) return;

        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const cd = resp.headers.get('Content-Disposition') || '';
        a.download = cd.match(/filename=(.+)/)?.[1] || 'export.gfa';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    menu.addOption('download', 'Download PNG', 'general', () => {
        exportGraphToPng(forceGraph);
    });

    menu.addOption('download', 'Download SVG', 'general', () => {
        exportGraphToSvg(forceGraph);
    });

    return menu;
}

export default function setupRightClickMenu(forceGraph) {
    populateOptions(forceGraph);

    forceGraph.element.addEventListener('contextmenu', event => {
        event.preventDefault();
        menu.showMenu(event.pageX, event.pageY);
    });

    forceGraph._cleanups.push(() => menu.destroy());
}
