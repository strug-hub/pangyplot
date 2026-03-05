// Entry point: init(), wire up modules.

import { state } from './simplify-state.js';
import { initSpine, setChromosome } from './data/spine.js';
import { precomputeBboxes, computeBounds, resizeCanvas, fitToScreen } from './render/viewport.js';
import { placeGenes } from './render/annotation/gene-label-renderer.js';
import { navigateToHash, scheduleHashUpdate } from './engines/navigation/hash-navigation.js';
import { scheduleFrame } from './render/render-manager.js';
import { scheduleDetailFetch } from './engines/bubble-pop/chain-pop-engine.js';
import { setupEngines } from './engines/engine-manager.js';
import { initGridMeter } from './lod/lod.js';

async function init() {
    try {
        const resp = await fetch('/simplify-data');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        state.data = await resp.json();
    } catch (err) {
        state.dom.loading.textContent = `Error loading data: ${err.message}`;
        return;
    }

    state.dom.loading.style.display = 'none';

    state.dom.stats.textContent =
        `${state.data.stats.totalSegments.toLocaleString()} segs | ` +
        `${state.data.stats.junctionCount.toLocaleString()} junctions | ` +
        `${state.data.levels.length} grid levels`;

    // Build chain family map: chainId -> Set of self + all descendants
    if (state.data.chainMeta) {
        const meta = state.data.chainMeta;
        const children = {};  // parent -> [child, ...]
        for (const cid in meta) {
            const p = meta[cid].parent;
            if (p != null) {
                (children[p] || (children[p] = [])).push(Number(cid));
            }
        }
        const family = {};
        for (const cid in meta) {
            const id = Number(cid);
            const set = new Set([id]);
            const stack = [id];
            while (stack.length) {
                const cur = stack.pop();
                for (const ch of (children[cur] || [])) {
                    set.add(ch);
                    stack.push(ch);
                }
            }
            family[id] = set;
        }
        state.data.chainFamily = family;
    }

    initGridMeter();
    precomputeBboxes();
    computeBounds();

    // Initialize reference spine if available
    if (state.data.refSpine) {
        initSpine(state.data.refSpine);
        setChromosome(state.data.chromosome || '');
        placeGenes();
    }

    resizeCanvas();

    // Navigate to URL hash coordinates, or fit whole graph
    if (!navigateToHash()) {
        fitToScreen();
    }
    scheduleFrame();
    scheduleDetailFetch();
    scheduleHashUpdate();
}

setupEngines();
init();
