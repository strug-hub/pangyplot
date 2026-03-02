// D3-force physics for exposed bubble ellipses — pushes overlapping bubbles apart.
// Modifies bubble .x/.y in place so render.js and hit-test.js need no changes.

import { state } from './simplify-state.js';
import { scheduleFrame } from './render.js';

let sim = null;
const homePos = new WeakMap();   // bubble → { x, y }

// Collision radius matching render.js: use visual minimum so physics
// separates bubbles that visually overlap at current zoom.
function collideRadius(b) {
    const minR = 4 / state.zoom;
    const rx = Math.max(b.rx, minR);
    const ry = Math.max(b.ry, minR);
    return Math.sqrt(rx * ry) * 1.2;
}

export function startPhysics(bubbles) {
    stopPhysics();
    if (!bubbles || bubbles.length === 0) return;

    // Stash original layout positions
    for (const b of bubbles) {
        homePos.set(b, { x: b.x, y: b.y });
    }

    sim = d3.forceSimulation(bubbles)
        .alphaMin(0.001)
        .alpha(0.3)
        .alphaDecay(0.02)
        .velocityDecay(0.4)
        .force('collide', d3.forceCollide()
            .radius(collideRadius)
            .strength(0.7)
            .iterations(3))
        .force('x', d3.forceX(b => homePos.get(b)?.x ?? b.x).strength(0.08))
        .force('y', d3.forceY(b => homePos.get(b)?.y ?? b.y).strength(0.08))
        .on('tick', () => {
            if (state.detailPhase === 'static') scheduleFrame();
        });
}

export function stopPhysics() {
    if (!sim) return;
    const nodes = sim.nodes();
    sim.stop();
    sim = null;

    // Restore original positions
    for (const b of nodes) {
        const home = homePos.get(b);
        if (home) {
            b.x = home.x;
            b.y = home.y;
        }
    }
}

export function restartPhysics(bubbles) {
    if (!bubbles || bubbles.length === 0) {
        stopPhysics();
        return;
    }

    // Stash home positions for new bubbles
    for (const b of bubbles) {
        if (!homePos.has(b)) {
            homePos.set(b, { x: b.x, y: b.y });
        }
    }

    if (sim) {
        sim.nodes(bubbles);
        sim.force('collide').radius(collideRadius);
        sim.force('x', d3.forceX(b => homePos.get(b)?.x ?? b.x).strength(0.08));
        sim.force('y', d3.forceY(b => homePos.get(b)?.y ?? b.y).strength(0.08));
        sim.alpha(0.3).restart();
    } else {
        startPhysics(bubbles);
    }
}
