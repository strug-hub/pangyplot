# BP-Proportional Link Rest Lengths (deferred)

## Problem

Chain arc lengths in graph units vary wildly relative to their bp span because odgi's layout places segments based on graph topology, not bp proportionality. Example: c600 (7.5kb) has 1.5k arc length while c123 (11.9kb) has 20.4k arc length — a 13x difference in screen density despite only 1.6x difference in bp.

## Proposed Solution

Set link rest lengths proportional to bp instead of arc length:

1. Compute a global `bpToGraph` scale: `totalArcLength / totalBp` across all chains
2. Each link's rest length becomes `(bpSpan / numLinks) * bpToGraph`
3. Store `_bpToGraph` at module level for incremental adds (pan)

This ensures all chains have the same bp-to-screen ratio. The springs would then reshape chains toward bp-proportional spacing.

## Implementation (tested, reverted)

In `polychain-adapter.js`:
- `initPolychainLayer()`: compute `_bpToGraph` from all chains' polylines and bpSpans
- Pass `bpToGraph` to `createPolychainForChain()`
- Replace `uniformLen = chainArcLen / (nodes.length - 1)` with `restLen = (bpSpan / numLinks) * bpToGraph`
- Store `_bpToGraph` in module scope for `addChainsToPolychainLayer()` reuse

## Why It Was Reverted

When applied, chains with layout-compact but bp-large spans get very long rest lengths. These chains don't unfold correctly because:

1. **Low loopFactor chains** — many chains that become long under bp-proportional rest lengths have low loopFactor, so centroid repulsion doesn't inflate them. They stay folded/compressed but with stretched springs, creating visual artifacts.

2. **Force balance** — the current forces (charge, layout pull, parent side) were tuned for the arc-length-based rest lengths. BP-proportional lengths require retuning all forces, particularly stronger inflation for chains that need to grow.

## Prerequisites for Re-enabling

- An inflation force that works on all chains, not just high-loopFactor ones (or a different metric than loopFactor)
- Possibly a "target arc length" force that pulls chains toward their bp-proportional total length
- Retuning of charge, layout, and parent forces for the new scale
- May also need the angle spring (Priority 3 from physics research) to prevent kinking during unfolding

## Current Behavior (kept)

Link rest lengths are uniform within each chain but based on the **arc length** of the original polyline: `chainArcLen / (nodes.length - 1)`. This preserves the odgi layout proportions. Variable link stiffness (`base / (1 + (arc/100k)^2)`) softens springs on long chains so they don't fight the layout.
