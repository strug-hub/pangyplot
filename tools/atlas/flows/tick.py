"""Flow — one tick of the force simulation, and the frame it paints.

Everything between one rendered frame and the next: d3's stepper wakes, alpha
cools by one step, fifteen forces run in registration order writing into node
velocities, d3 integrates velocity into position, the tick event fires, and a
requestAnimationFrame-coalesced draw() repaints the canvas.

This flow is pure frontend. It cannot be timed from a Python build -- there is no
browser here -- so the one context carries no timings. What it carries instead is
a static probe over pangyplot/static/js/graph/detail/engines/force-engine.js:
the force registration list is parsed out of initForce() and checked against what
this page claims. If someone adds, removes or reorders a force, the probe goes
red and this page is wrong until it is fixed.

Real per-frame numbers come from the in-app debug HUD, not from here. See the
context line.
"""

import os
import re

from core import ROOT

SLUG = "tick"
NAME = "sim tick"
TITLE = "one <code>tick</code> — a frame of the force simulation"
SUB = ("d3's stepper wakes, alpha cools one step, fifteen forces run in registration order, "
       "positions integrate, and one rAF-coalesced <code>draw()</code> repaints the canvas. "
       "The forces are the substance: their <b>order</b> is invisible in the source and load-bearing. "
       "Nothing here is timed by the build — see the note below the title for where the real "
       "frame numbers live.")
CTX_LABEL = "context"

FORCE_ENGINE = "pangyplot/static/js/graph/detail/engines/force-engine.js"
FORCES_DIR = "pangyplot/static/js/graph/detail/engines/forces"
POLYCHAIN_FORCES = f"{FORCES_DIR}/polychain-forces.js"
LAYOUT_FORCES = f"{FORCES_DIR}/layout-forces.js"
VIEWPORT_FORCES = f"{FORCES_DIR}/viewport-forces.js"
CHAIN_GUIDE = f"{FORCES_DIR}/chain-guide-force.js"
ANCHOR_GAP = f"{FORCES_DIR}/anchor-gap-force.js"
CENTROID_ANCHOR = "pangyplot/static/js/graph/engines/drag/centroid-anchor-force.js"
RENDER_MANAGER = "pangyplot/static/js/graph/render-manager.js"
SCHEDULER = "pangyplot/static/js/graph/utils/frame-scheduler.js"
MODEL_MANAGER = "pangyplot/static/js/graph/detail/model/model-manager.js"
DRAG_ENGINE = "pangyplot/static/js/graph/engines/drag/drag-engine.js"
DRAG_INFLUENCE = "pangyplot/static/js/graph/engines/drag/drag-influence-force.js"
DRAG_INFLUENCE_ENGINE = "pangyplot/static/js/graph/engines/drag/drag-influence-engine.js"
GATE = "pangyplot/static/js/graph/engines/force-interaction-gate.js"
LOD = "pangyplot/static/js/graph/engines/lod-engine.js"
HUD = "pangyplot/static/js/graph/debug/debug-hud.js"

# The fifteen forces, in the order initForce() registers them -- which is the
# order d3 applies them, because sim.forces is a Map and Map iterates in
# insertion order (d3.js: `forces.forEach(force => force(alpha))`).
FORCE_STEPS = [
  {"name": "1. vpFreeze — viewportFreezeForce",
   "fns": [(VIEWPORT_FORCES, "viewportFreezeForce")],
   "gist": "Pins every node outside the viewport (plus a 50% margin on each side) by writing fx/fy, and zeroes vx/vy on anything already frozen.",
   "cost": "Must be first: it zeroes velocity, so any force that ran before it would have its contribution silently discarded on frozen nodes."},
  {"name": "2. link — d3.forceLink",
   "fns": [(FORCE_ENGINE, "linkDistance"), (FORCE_ENGINE, "linkStrength")],
   "gist": "The only stock d3 force in the sim. Rest length and stiffness are both accessor functions on the link's own class: polychain links use their arc length, bridge and intra-chain links a flat 10, everything else length × LINK_SCALE (1).",
   "cost": "linkStrength softens long polychain links by 1 / (1 + (arc/100000)²) — LINK_SOFTEN_MIDPOINT = 100000 is a bare magic number in force-engine.js with no derivation. Links touching an anchor node are hard-coded to 0.5; the chainGuide force positions anchors instead."},
  {"name": "3. charge — isolatedCharge(polychain nodes)",
   "fns": [(FORCE_ENGINE, "isolatedCharge")],
   "gist": "Many-body repulsion between polychain spine nodes only: strength pcSettings.charge (−200) × dataScale, distanceMax 400 × dataScale.",
   "cost": "Isolation is faked: the inner forceManyBody runs over ALL nodes, then this wrapper restores the saved vx/vy of every node outside the group. Two full passes over the node array per tick, per charge force, on top of the quadtree."},
  {"name": "4. segCharge — isolatedCharge(popped segments)",
   "fns": [(FORCE_ENGINE, "chargeStr"), (FORCE_ENGINE, "chargeMaxDist")],
   "gist": "The second isolated many-body force: popped segment nodes (not polychain, but with a chainId) repel each other at −20 × dataScale, distanceMax 100 × dataScale. The two charge groups never see each other.",
   "cost": "Same save/restore trick as charge, so the whole node array is walked twice more."},
  {"name": "5. layout — combinedLayoutForce",
   "fns": [(LAYOUT_FORCES, "combinedLayoutForce")],
   "gist": "Spring back toward each node's homeX/homeY (its odgi layout position). k = standardStrengths[pcSettings.layoutLevel] × alpha — level 2 → 0.001. Popped content gets 30% of that so it can self-organize inside its compartment.",
   "cost": "Its strengthLevel() setter is dead — see the hazards on this stage."},
  {"name": "6. centroid — centroidRepulsion",
   "fns": [(POLYCHAIN_FORCES, "centroidRepulsion")],
   "gist": "Pushes every polychain node radially away from its ROOT chain's centroid, scaled by the chain's loopFactor. Uniform outward pressure that inflates loops evenly, O(n).",
   "cost": "Strength = loopLevels[pcSettings.centroidLevel] × alpha × dataScale — level 1 → 1. Groups of fewer than 3 nodes, and chains with loopFactor 0, are skipped."},
  {"name": "7. loopClosure — loopClosureForce",
   "fns": [(POLYCHAIN_FORCES, "loopClosureForce")],
   "gist": "Magnetic pull along the head→tail axis of each chain, weighted +1 at the head and −1 at the tail so the interior cancels: it curls a chain shut (loopFactor > 0.5) or straightens it (< 0.5).",
   "cost": "OFF by default. pcSettings.loopLevel is 0 and loopLevels[0] is 0, so the force returns on its first line every tick. It still groups and sorts nothing — the early return is before the grouping — but it is a live force that does nothing until someone moves a slider."},
  {"name": "8. smoothing — laplacianSmoothing",
   "fns": [(POLYCHAIN_FORCES, "laplacianSmoothing")],
   "gist": "Nudges each interior spine node toward the midpoint of its two chain neighbours: k × (x[i−1] + x[i+1] − 2x[i]). Kills kinks without moving the chain.",
   "cost": "k = pcSettings.smoothing (0.005) × alpha, damped to 30% on loops (1 − 0.7 × loopFactor) so it doesn't collapse curvature. Re-groups and re-sorts every chain by nodeIndex every tick."},
  {"name": "9. balloon — balloonInflation",
   "fns": [(POLYCHAIN_FORCES, "balloonInflation")],
   "gist": "Active-contour inflation: pushes each spine node outward along the local curve normal via the signed-area gradient, with the shoelace winding sign so the normal always points out. Link springs are the counterforce.",
   "cost": "k = pcSettings.inflate (0.005) × alpha × loopFactor. Loops only — a chain with loopFactor 0 is skipped."},
  {"name": "10. parentSide — parentSideForce",
   "fns": [(POLYCHAIN_FORCES, "parentSideForce")],
   "gist": "Pushes a child chain perpendicular to each of its ancestor polylines, so nested chains fan out to one side of their parent instead of overlapping it. Depth-weighted 1, 1/2, 1/3 up the ancestry.",
   "cost": "Strength pcSettings.parentSide (1.5) × alpha × dataScale, falloff to zero at 500 × dataScale. It keeps its OWN tick counter and re-projects every node onto every ancestor polyline every 20th tick — the recompute is a per-chain O(nodes × polyline) sweep that lands on one frame in twenty, not amortized."},
  {"name": "11. delLink — delLinkForce",
   "fns": [(LAYOUT_FORCES, "delLinkForce")],
   "gist": "Pushes the inside of a popped bubble perpendicularly off its deletion link (the source→sink bypass), so the two alleles don't draw on top of each other.",
   "cost": "The heaviest custom force. Every tick it does getLinks().filter(l => l.isDel), then for each deletion link a full nodes.filter() over the whole sim — O(delLinks × nodes) with a fresh array allocation per link, per frame."},
  {"name": "12. chainGuide — chainGuideForce",
   "fns": [(CHAIN_GUIDE, "chainGuideForce")],
   "gist": "Projects each popped node onto the nearest point of its parent chain's live polyline and pulls it there — a soft shape hint the link springs can overcome.",
   "cost": "k = pcSettings.guideLevel (0.015) × alpha. The _chainCache it builds is cleared on the FIRST line of every tick, so it is a within-tick memo only; the projection itself is O(nodes × polyline segments) every frame."},
  {"name": "13. anchorGap — anchorGapForce",
   "fns": [(ANCHOR_GAP, "anchorGapForce")],
   "gist": "Pushes popped content away from the head/tail anchors that bound the gap it was popped into, along the spine tangent — so the new content centres itself in the hole rather than piling on the seam.",
   "cost": "Strength 2 × dataScale × alpha, radius 100 × dataScale. Tangent comes from container.positionAt(t ± 0.005) — two spine evaluations per anchor per tick."},
  {"name": "14. centroidAnchor — centroidAnchorForce",
   "fns": [(CENTROID_ANCHOR, "centroidAnchorForce")],
   "gist": "Soft spring holding every node of a dropped chain at the position it was dropped at: SPRING_SOFT 0.01, or SPRING_FIXED 0.4 when 'fix on drag' is on.",
   "cost": "Not a force. It writes n.x/n.y directly and ignores alpha entirely — see the hazards on this stage."},
  {"name": "15. spawnDamp — spawnDampingForce",
   "fns": [(FORCE_ENGINE, "spawnDampingForce")],
   "gist": "Scales vx/vy down on nodes younger than SPAWN_DAMP_TICKS (18) by age/18, so freshly popped content doesn't get flung by the charge impulse on its first frame.",
   "cost": "Must be LAST. It multiplies the velocity every previous force accumulated; any force registered after it escapes the damping entirely. Nothing in the code enforces the position — only the order of the .force() calls in initForce()."},
]

STAGES = [
  {
    "id": "drive", "name": "The driver",
    "fns": [(FORCE_ENGINE, "initForce"), (SCHEDULER, "scheduleFrame")],
    "gist": "Two loops, not one. d3's own timer steps the physics; a separate rAF, coalesced through frame-scheduler, paints. They are wired together only by the sim's tick event.",
    "inp": "a pop, a drag, a slider — anything that reheats alpha",
    "out": "a running d3 stepper",
    "checks": [],
    "tests": [],
    "notes": [
      ("The sim is constructed running, then immediately stopped",
       "d3.forceSimulation() starts its internal <code>timer(step)</code> the moment it is constructed. "
       "initForce() therefore sets <code>.alpha(0)</code> and calls <code>sim.stop()</code> on the next line. "
       "Remove that stop() and an empty sim burns a rAF slot forever."),
    ],
    "invariants": [
      ("Rendering is never driven by the sim directly",
       "onTick() calls scheduleFrame(), which is a no-op if a rAF is already in flight. So N sim ticks in one "
       "frame still produce one draw(), and pan/zoom/hover/colour changes can schedule a draw with the sim "
       "cold. Never call draw() from a force."),
      ("Interaction outranks physics",
       "pan-zoom calls pauseForInteraction() → pauseSim(), which stashes alpha and stops the stepper; "
       "resumeAfterInteraction() restores that exact alpha 150 ms after the last event. Panning does not cool "
       "the simulation — it suspends it. Anything that stops the sim without going through pauseSim() loses "
       "the stashed alpha."),
    ],
    "sub": [
      {"name": "Reheat", "fns": [(FORCE_ENGINE, "reheatSimulation")],
       "gist": "alpha(1).restart() — every pop, unpop, node insert and settings change goes through one of these.",
       "cost": "addPoppedNodes, insertPoppedContent, removePoppedContent and applyPcSettings all reheat to a full alpha(1); a drag only reheats to max(alpha, 0.3)."},
      {"name": "The stepper", "fns": [(FORCE_ENGINE, "initForce")],
       "gist": "d3.forceSimulation → timer(step). Each step: cool alpha, run every force, integrate, fire 'tick', and stop when alpha < alphaMin (0.001).",
       "cost": "d3's timer is itself requestAnimationFrame-backed, so the physics step and the paint share the browser's frame budget."},
      {"name": "The paint scheduler", "fns": [(SCHEDULER, "scheduleFrame")],
       "gist": "One rAF in flight at a time; scheduleFrame() while one is pending returns immediately.",
       "cost": ""},
      {"name": "The interaction gate", "fns": [(GATE, "pauseForInteraction")],
       "gist": "Pan/zoom pauses the sim and resumes it 150 ms after the last event, so dragging the viewport gets the whole frame.",
       "cost": ""},
    ],
  },
  {
    "id": "alpha", "name": "Alpha cools — first, before any force",
    "fns": [(FORCE_ENGINE, "getAlpha")],
    "gist": "d3's tick() does alpha += (alphaTarget - alpha) * alphaDecay BEFORE it runs a single force. So the alpha a force is handed is already one step cooler than the one the previous frame saw.",
    "inp": "alpha, alphaDecay = HEAT_DECAY, alphaTarget = 0",
    "out": "the alpha every force multiplies its strength by",
    "checks": [],
    "tests": [],
    "notes": [
      ("HEAT_DECAY is 10× slower than d3's default, and the sim runs for ~50 seconds because of it",
       "force-defaults.js: <code>HEAT_DECAY: 0.00228, //default = 0.0228</code>. d3's default decay "
       "(1 − 0.001^(1/300)) cools alpha 1 → alphaMin in 300 ticks, about 5 s. At 0.00228 that becomes roughly "
       "3000 ticks — <b>~50 s of continuous simulation at 60 fps after every single pop</b>. Nothing in the "
       "repo derives the constant; it is a hand-tuned magic number, and it is the reason the viewer stays warm "
       "so long after an interaction."),
    ],
    "invariants": [
      ("Every custom force multiplies by alpha — except two, deliberately",
       "The convention across forces/ is <code>strength × alpha</code>, so a force fades out as the sim cools. "
       "viewportFreezeForce ignores alpha because it is a constraint, not a force. centroidAnchorForce ignores "
       "it too — but that one is a bug (see stage 3's hazards). If you add a force, multiply by alpha."),
      ("FRICTION 0.1 is d3's velocityDecay, and d3 inverts it",
       "<code>.velocityDecay(0.1)</code> makes d3 store <code>1 − 0.1 = 0.9</code> and multiply velocity by "
       "0.9 each tick. It is 0.1 of <i>friction</i>, not 0.1 of retained velocity — the opposite of how it "
       "reads. d3's default is 0.4 (i.e. ×0.6), so this sim is far less damped than stock."),
    ],
    "sub": [],
  },
  {
    "id": "forces", "name": "Fifteen forces, in registration order",
    "fns": [(FORCE_ENGINE, "initForce")],
    "gist": "d3 stores forces in a Map and iterates it in insertion order, so the order of the .force() calls in initForce() IS the order they run. Every one of them writes into node.vx/node.vy; nothing has moved yet.",
    "inp": "alpha, and the shared node array",
    "out": "node.vx / node.vy, accumulated",
    "checks": ["force_order", "force_count", "no_duplicate_force", "factories_defined", "all_force_modules_wired"],
    "tests": ["tests/graph/polychain-model.test.js"],
    "flag": True,
    "notes": [
      ("layout's strengthLevel() setter is dead — every call to it is a no-op",
       "combinedLayoutForce() stores the value in a local <code>standardLevel</code>, and <code>force()</code> "
       "never reads it: it reads <code>standardStrengths[pcSettings.layoutLevel]</code> instead. "
       "force-engine.js calls <code>sim.force('layout').strengthLevel(defaults.LAYOUT_LEVEL)</code> in four "
       "places (addPoppedNodes, insertPoppedContent, removePoppedContent, initForce) and none of them changes "
       "anything. defaults.LAYOUT_LEVEL is 1; the force actually runs at pcSettings.layoutLevel = 2. Whoever "
       "wrote those four calls believed they were setting the layout strength."),
      ("centroidAnchor is not a force — it writes positions, and it never cools",
       "centroid-anchor-force.js: the returned function takes <code>_alpha</code> and ignores it, then does "
       "<code>n.x += (rest.x − n.x) × strength</code>. Every other force writes velocity and lets d3 integrate. "
       "This one teleports nodes mid-force-pass, so the eleven forces registered before it have already written "
       "velocities based on positions this force is about to change, and the four after it see the new ones. "
       "It also stays at full strength at alpha 0.001, so an anchored chain is rigid right up to the moment "
       "the stepper halts."),
      ("collide is commented out but still referenced in three places",
       "force-engine.js has the <code>.force('collide', ...)</code> registration commented out. "
       "<code>applyPcSettings()</code> still fetches it and guards with <code>if (collide)</code>; "
       "<code>computeForceDeltas()</code> still lists 'collide' in its force-name array; and "
       "<code>collideRadius()</code> — plus defaults.COLLISION_RADIUS and COLLISION_STRENGTH — are now "
       "unreachable dead code. Nothing collides in this viewer, and nothing says so."),
      ("profileForces() silently under-reports the sim",
       "Its hard-coded name list is 11 entries and misses <b>segCharge, chainGuide, anchorGap, centroidAnchor "
       "and spawnDamp</b> while including the non-existent collide. Profile a slow frame with it and five of "
       "the fifteen live forces — including delLink's O(links × nodes) filter — are invisible. "
       "computeForceDeltas() (the force-vector debug view) has the same problem in the other direction: it "
       "lists collide and omits vpFreeze."),
    ],
    "invariants": [
      ("The order is the source of truth, and it is invisible",
       "There is no ordering table, no priority field, no sort. d3 runs the forces in the order the "
       "<code>.force(name, …)</code> calls appear in initForce(). Move one line and the physics changes. "
       "Three positions are load-bearing: <b>vpFreeze must be first</b> (it zeroes velocity, so anything "
       "before it is discarded on frozen nodes), <b>centroidAnchor must be after every velocity writer</b> "
       "(it overwrites position), and <b>spawnDamp must be last</b> (it scales the accumulated velocity, so a "
       "force after it escapes damping)."),
      ("The two charge forces are isolated by save-and-restore, not by node filtering",
       "isolatedCharge() runs a real d3.forceManyBody over the whole node array, then puts back the vx/vy of "
       "every node the filter rejects. The strength accessor also returns 0 for out-of-group nodes so they "
       "aren't charge <i>sources</i>. Both halves are needed: drop the restore and out-of-group nodes get "
       "flung; drop the zero strength and they still repel."),
      ("Forces read the live nodes array, which the sim owns",
       "Each factory keeps a <code>nodes</code> reference handed to it by <code>force.initialize()</code>. "
       "syncNodes() calls sim.nodes(arr), which re-initializes every force with the new array. Mutating the "
       "node array in place without going through syncNodes() leaves forces pointed at the old one."),
    ],
    "sub": FORCE_STEPS,
  },
  {
    "id": "integrate", "name": "Integration and pinning",
    "fns": [(FORCE_ENGINE, "initForce")],
    "gist": "After the last force, d3 walks the node array once: if fx is null, x += vx *= velocityDecay; otherwise x = fx and vx = 0. That single branch is the entire pin contract, and three different subsystems write fx.",
    "inp": "node.vx / node.vy",
    "out": "node.x / node.y — the positions the renderer reads",
    "checks": [],
    "tests": ["tests/graph/sim-object.test.js"],
    "invariants": [
      ("fx/fy has three owners and one shared rule: only claim a node whose fx is already null",
       "viewportFreezeForce pins offscreen nodes but sets <code>_vpFrozen</code> and only claims a node when "
       "<code>n.fx == null</code>; it unpins only nodes it flagged. The drag engine sets fx/fy on the drag "
       "target (or on every spine node for a chain drag) and clears them in endDrag(), where it also resets "
       "<code>_vpFrozen = false</code> so viewportFreeze re-evaluates them. 'Fix on drag' leaves fx/fy set "
       "permanently. A fourth writer that ignores <code>_vpFrozen</code> would strand nodes pinned forever."),
      ("A pinned node's velocity is zeroed, not preserved",
       "d3 does <code>node.x = node.fx, node.vx = 0</code>. Forces still push pinned nodes every tick and the "
       "push is thrown away — which is why viewportFreeze also zeroes vx/vy itself: without that, the charge "
       "quadtree still spends the time, and the instant a node unpins it launches with a tick of accumulated "
       "velocity."),
    ],
    "notes": [],
    "sub": [],
  },
  {
    "id": "ontick", "name": "The tick event",
    "fns": [(FORCE_ENGINE, "onTick")],
    "gist": "The sim's only outward-facing hook. It bumps the spawn-damp tick counter, snaps every SimObject's anchors onto its container's live spine, and asks for a repaint.",
    "inp": "freshly integrated positions",
    "out": "updated anchors + a scheduled frame",
    "checks": [],
    "tests": ["tests/graph/sim-object.test.js", "tests/graph/polychain-model.test.js"],
    "invariants": [
      ("Anchors are derived, not simulated",
       "updateAnchors() runs after integration and before the paint: each PolychainSegment pulls its head/tail "
       "anchor positions from its container's spine. Anchors are in the sim's node array (the link force sees "
       "them, at a hard-coded strength of 0.5) but their positions are recomputed from the spine every tick, "
       "so any force that moves an anchor is overwritten before anything renders it. chainGuideForce "
       "explicitly filters anchors out of its polyline to avoid the feedback loop."),
      ("Paint is gated on detailPhase",
       "onTick only calls scheduleFrame() when <code>state.detailPhase</code> is neither 'none' nor "
       "'fading-out'. A sim running while the detail layer is fading out will not repaint on its own — the "
       "transition engine's own rAF does that."),
    ],
    "notes": [],
    "sub": [
      {"name": "Bump the tick counter", "fns": [(FORCE_ENGINE, "spawnDampingForce")],
       "gist": "_tickCount is the clock spawnDamp uses to age new nodes; insertPoppedContent stamps _spawnTick on every child it adds.",
       "cost": ""},
      {"name": "Snap anchors to the spine", "fns": [(MODEL_MANAGER, "updateAnchors")],
       "gist": "Walk every container's segments and recompute their anchors from the live spine.",
       "cost": "O(all segments of all containers), every tick, unconditionally — it does not check whether the container moved."},
      {"name": "Ask for a frame", "fns": [(SCHEDULER, "scheduleFrame")],
       "gist": "Coalesced: many ticks, at most one draw per animation frame.",
       "cost": ""},
    ],
  },
  {
    "id": "render", "name": "The render pass",
    "fns": [(RENDER_MANAGER, "draw")],
    "gist": "One canvas, cleared and fully repainted every frame: LOD, then skeleton, then detail, then the force graph, then overlays, then screen-space chrome. There is no partial invalidation and no layer caching.",
    "inp": "state.zoom / panX / panY, and the positions the sim just wrote",
    "out": "pixels",
    "checks": [],
    "tests": ["tests/graph/render-offset.test.js"],
    "notes": [
      ("Detail chain polylines are not viewport-culled",
       "drawSkeleton() culls by precomputed bbox and drawForceGraph() culls links and nodes against the "
       "viewport, but getVisibleChainPolylinesByColor() — despite the name — walks every chain in "
       "<code>state.detailData</code> and every segment of every container, and calls seg.getPolyline() on all "
       "of them, regardless of where they are. The 'visible' in the name refers to colour grouping."),
      ("A missing level meta clears the canvas and returns",
       "draw() fills the background, calls updateLOD(), then <code>if (!meta) return;</code> — before the "
       "ctx.save(). The frame is already blanked at that point, so a chromosome whose level metadata hasn't "
       "loaded paints an empty canvas rather than leaving the last good frame up."),
    ],
    "invariants": [
      ("The render offset exists to keep float32 precision",
       "setRenderOffset() subtracts the viewport origin from every world coordinate before it reaches the "
       "canvas, so the canvas only ever sees small numbers. Genome layout coordinates are large enough that "
       "drawing them raw loses precision in the canvas's 32-bit transform. Every painter must go through "
       "rx()/ry(); one that doesn't will drift visibly at high zoom."),
      ("Draw order is a painter's algorithm and the order is the z-order",
       "skeleton → gene halos → detail chains and bubble circles → force graph → path trace → debug view → "
       "search rings, all inside the zoom transform; then selection box → annotation labels → gene labels → "
       "debug HUD in screen space, after ctx.restore(). Anything moved across that restore() changes "
       "coordinate space, not just stacking."),
    ],
    "sub": [
      {"name": "Clear + pick the LOD", "fns": [(LOD, "updateLOD")],
       "gist": "Clear to the background colour, then choose the skeleton mipmap level whose gridSize fits ~2000 grid units across the viewport.",
       "cost": "Runs before anything is drawn; state.targetGridSize set here is what the detail layer later uses to decide whether bubble circles appear at all."},
      {"name": "Viewport + render offset", "fns": [(RENDER_MANAGER, "draw")],
       "gist": "Compute the visible data-space rectangle, pad it by 2 × gridSize so edge lines aren't clipped, set the render offset, scale the context by zoom.",
       "cost": ""},
      {"name": "Skeleton layer", "fns": [("pangyplot/static/js/graph/skeleton/render/skeleton-render-manager.js", "drawSkeleton")],
       "gist": "Cull the level's polylines against the padded viewport by precomputed bbox, then draw base → hover overlay → gene-coloured overdraw.",
       "cost": "Skipped entirely once detail is fully active (detailPhase === 'static' and detailData present and alwaysShowSkeleton off) — that skip is what makes the detail view affordable."},
      {"name": "Detail layer", "fns": [("pangyplot/static/js/graph/detail/render/polychain/polychain-render-manager.js", "drawDetail")],
       "gist": "Gene halos, then chain polylines batched by colour, then bubble circles batched by (colour, alpha quantized to 0.1).",
       "cost": "The only per-frame LOD in the detail layer: a bubble circle is drawn only if state.targetGridSize is below its own bp-derived threshold, and fades in over a range around it. Gene pins are re-placed every frame while fading, then throttled to once per 500 ms."},
      {"name": "Force graph", "fns": [("pangyplot/static/js/graph/detail/render/force-render-manager.js", "drawForceGraph")],
       "gist": "The popped nodes and links: categorized into kink / chain / junction / deletion buckets, viewport-culled, then stroked in batches.",
       "cost": "A link survives culling if EITHER endpoint is inside the viewport. Polychain and spine links are skipped outright — they are physics-only infrastructure and never drawn."},
      {"name": "Path trace overlay", "fns": [("pangyplot/static/js/graph/engines/path-trace/path-trace-animation.js", "tickPathAnimation")],
       "gist": "Advance the waypoint animation by wall-clock time, then stroke the traced haplotype over everything else in the data-space layer.",
       "cost": "Timed off performance.now() inside draw(), not off the sim's tick — so the trace animates at the paint rate even when the sim is cold."},
      {"name": "Screen-space chrome", "fns": [("pangyplot/static/js/graph/skeleton/render/gene-label-overlay.js", "drawGeneLabelOverlay")],
       "gist": "After ctx.restore(): the selection rectangle, custom annotation labels, and gene labels — all in raw screen pixels.",
       "cost": ""},
      {"name": "Debug HUD", "fns": [(HUD, "drawDebugHud")],
       "gist": "Only in debug mode: FPS, the alpha decay bar, a scale bar, and the per-layer millisecond breakdown.",
       "cost": "The per-layer performance.now() calls in draw() are themselves guarded by isDebugMode(), so instrumenting costs nothing when it's off."},
    ],
  },
  {
    "id": "cool", "name": "Cooling, and the stop",
    "fns": [(FORCE_ENGINE, "isSimulating")],
    "gist": "d3 stops the stepper the moment alpha drops below alphaMin (0.001) and fires 'end'. Nothing in this codebase listens for 'end' — the last frame is simply the last one anybody scheduled.",
    "inp": "alpha, alphaMin",
    "out": "a stopped stepper, and a canvas nobody repaints until something asks",
    "checks": [],
    "tests": [],
    "invariants": [
      ("pauseSim / resumeSim are the only way to stop the sim without losing its heat",
       "pauseSim() stashes the current alpha and calls stop(); resumeSim() refuses to restart if the stashed "
       "alpha is already below alphaMin, so pausing a cold sim can't accidentally revive it. Calling sim.stop() "
       "anywhere else throws the alpha away and the layout freezes wherever it happened to be."),
    ],
    "notes": [
      ("clearForce() stops the sim; nothing restarts it but a pop",
       "clearForce() empties the node and link arrays and calls stop(). initForce() is idempotent "
       "(<code>if (sim) return</code>), so the same simulation object is reused for the entire session — "
       "including its _tickCount, its accumulated force closures, and parentSideForce's private tick counter, "
       "which never reset."),
    ],
    "sub": [],
  },
  {
    "id": "drag", "name": "Drag, and how it enters the tick",
    "fns": [(DRAG_ENGINE, "activateDrag")],
    "gist": "A drag never touches a force. It writes fx/fy (which the integrator obeys), reheats alpha to at least 0.3, and on release hands the chain to centroidAnchorForce as a soft spring back to the drop position.",
    "inp": "pointer events",
    "out": "fx/fy, a reheated alpha, and an anchored chain",
    "checks": [],
    "tests": [],
    "notes": [
      ("The drag influence system is dead code — and the tick still calls into it",
       "drag-influence-engine.js is the only module that registers the dragInfluence force "
       "(<code>registerCustomForce('dragInfluence', dragInfluenceForce())</code>) and <b>nothing imports it</b> "
       "— engine-manager.js does not set it up. So dragInfluenceForce() is never registered and never runs, and "
       "drag-influence-render.js is imported by nobody at all. But drag-engine.js still imports "
       "<code>resetDragInfluence</code> from drag-influence-force.js and calls it on every drag activation, "
       "with a comment explaining a race in a force that cannot fire. Three modules, one live call, zero effect."),
      ("polychain-force-engine.js is an entire second d3 simulation that nothing imports",
       "It builds its own forceSimulation with its own alphaDecay, friction and four forces, and would throw "
       "if it ever ran: <code>sim.force('linkRepulsion').links([])</code> dereferences a force whose "
       "registration is commented out a few lines above. It is unreferenced from anywhere in static/js — a "
       "whole parallel physics engine sitting in the tree, ready to be mistaken for the live one."),
    ],
    "invariants": [
      ("A chain drag is a rigid-body translation of the spine, not a force",
       "updateDrag() adds the pointer delta to x, y, fx AND fy of every spine node in the container, so the "
       "chain moves as one and the integrator can't fight it. endDrag() clears fx/fy, resets _vpFrozen so the "
       "viewport freeze re-evaluates, and calls anchorChain() — which snapshots every node's rest position. "
       "The chain is then held by springs, not pins: the rest of the graph can still deform it."),
      ("Fix-on-drag chooses the spring, not the pin",
       "anchorChain(chainId, nodes, fixed) picks SPRING_FIXED (0.4) instead of SPRING_SOFT (0.01). Even "
       "'fixed' is a spring — a fixed chain is 40× stiffer, not immovable. Nodes held by centroidAnchor are "
       "also skipped by viewportFreezeForce (<code>if (n._centroidAnchored) continue</code>), so an anchored "
       "chain keeps simulating off-screen."),
    ],
    "sub": [
      {"name": "Activate", "fns": [(DRAG_ENGINE, "activateDrag")],
       "gist": "After 5 px of movement: pin the target (node) or the whole spine (chain) with fx/fy, and reheat to max(alpha, 0.3).",
       "cost": "Also calls resetDragInfluence() — into a subsystem that no longer exists in the tick."},
      {"name": "Move", "fns": [(DRAG_ENGINE, "updateDrag")],
       "gist": "Rewrite fx/fy from the pointer each pointermove and reheat again; the integrator copies fx→x on the next tick.",
       "cost": ""},
      {"name": "Release", "fns": [(CENTROID_ANCHOR, "anchorChain")],
       "gist": "Snapshot every node's rest position and hand the chain to centroidAnchorForce, which springs it back toward the drop pose every tick from then on.",
       "cost": "Anchors are never released by time or distance — only releaseChain()/releaseAllChains() clear them, so an anchored chain is anchored for the rest of the session."},
      {"name": "The dead influence force", "fns": [(DRAG_INFLUENCE, "dragInfluenceForce")],
       "gist": "Never registered. Kept alive only by drag-engine.js's import of resetDragInfluence from the same module.",
       "cost": "See the hazards on this stage."},
    ],
  },
]


# ---------------------------------------------------------------------------
# The one context: a static check over the force registrations.
#
# This flow runs in a browser, so the build cannot time it. What the build CAN
# do is read force-engine.js and verify that the force list this page prints is
# the force list the code registers.
# ---------------------------------------------------------------------------

# What this page claims, derived from FORCE_STEPS so the two cannot drift.
CLAIMED = [s["name"].split(". ", 1)[1].split(" — ")[0] for s in FORCE_STEPS]

_REG_RX = re.compile(r"^\s*\.force\(\s*'([A-Za-z0-9_]+)'\s*,\s*(.*)$")
_IMPORT_RX = re.compile(r"^import\s+\{([^}]*)\}", re.M)
_LOCAL_RX = re.compile(r"^(?:export\s+)?function\s+([A-Za-z0-9_]+)", re.M)


def _read(rel):
    p = os.path.join(ROOT, rel)
    return open(p, encoding="utf-8", errors="replace").read() if os.path.exists(p) else ""


def parse_forces():
    """Pull the ordered force registrations out of initForce() in force-engine.js.

    Returns (names, factories, src) where factories[name] is the identifier used
    to build it -- 'd3' for stock d3 forces, else a local or imported symbol.
    """
    src = _read(FORCE_ENGINE)
    body = src.split("export function initForce()", 1)
    if len(body) < 2:
        return [], {}, src
    body = body[1].split("\n    sim.stop();", 1)[0]

    names, factories = [], {}
    for line in body.split("\n"):
        m = _REG_RX.match(line)
        if not m:
            continue                      # commented-out registrations start with // and never match
        name, rhs = m.group(1), m.group(2)
        names.append(name)
        if rhs.startswith("d3."):
            factories[name] = "d3"
        else:
            fm = re.match(r"([A-Za-z0-9_]+)", rhs)
            factories[name] = fm.group(1) if fm else "?"
    return names, factories, src


def known_symbols(src):
    """Every identifier force-engine.js can legally call: its imports + its own functions."""
    syms = set(_LOCAL_RX.findall(src))
    for block in _IMPORT_RX.findall(src):
        for part in block.split(","):
            syms.add(part.strip().split(" as ")[-1].strip())
    return {s for s in syms if s}


def probe():
    """Static checks over the sim's force registration list."""
    out = {}

    def rec(key, ok, detail, weak=False):
        out[key] = {"ok": ok, "detail": detail, "weak": weak}

    names, factories, src = parse_forces()

    rec("force_order", names == CLAIMED,
        " → ".join(names) if names == CLAIMED
        else f"page says [{', '.join(CLAIMED)}] — code registers [{', '.join(names)}]")

    rec("force_count", len(names) == len(CLAIMED),
        f"{len(names)} forces registered, {len(CLAIMED)} documented on this page")

    dupes = sorted({n for n in names if names.count(n) > 1})
    rec("no_duplicate_force", not dupes,
        "no force registered twice" if not dupes else f"registered twice: {', '.join(dupes)}")

    syms = known_symbols(src)
    missing = sorted({n: f for n, f in factories.items()
                      if f != "d3" and f not in syms}.items())
    rec("factories_defined", not missing,
        "every force factory is imported or defined in force-engine.js" if not missing
        else "unresolvable factories: " + ", ".join(f"{n}→{f}()" for n, f in missing))

    # Which force factories exist in the tree but are never registered?
    wired = {f for f in factories.values() if f != "d3"}
    orphans = []
    for rel in (VIEWPORT_FORCES, LAYOUT_FORCES, POLYCHAIN_FORCES, CHAIN_GUIDE, ANCHOR_GAP,
                CENTROID_ANCHOR, DRAG_INFLUENCE):
        for fn in re.findall(r"^export function ([A-Za-z0-9_]*[Ff]orce|[a-z][A-Za-z0-9_]*)\s*\(\s*\)",
                             _read(rel), re.M):
            if fn.lower().endswith(("force", "repulsion", "smoothing", "inflation")) and fn not in wired:
                orphans.append(f"{fn}() in {os.path.basename(rel)}")
    rec("all_force_modules_wired", not orphans,
        "every force factory in the tree is registered" if not orphans
        else "never registered: " + "; ".join(sorted(orphans)))

    return out


def contexts():
    dead = []
    if _read(DRAG_INFLUENCE_ENGINE) and "drag-influence-engine" not in _read(DRAG_ENGINE):
        dead.append("drag-influence-engine.js")
    line = (
        '<span class="warn">This flow is not timed by the build — it runs in a browser, and there is no '
        'browser here. Every stage on this page shows “—”, on purpose.</span> '
        'Real frame timings already exist in the app: run '
        '<code>python pangyplot.py run --debug</code> (or ctrl/cmd-click the version overlay) and the debug '
        'HUD draws live FPS, the alpha-decay bar, and a 5-frame rolling millisecond breakdown of the '
        'skeleton / detail / labels layers, bottom-right. For per-force cost, call '
        '<code>profileForces()</code> from force-engine.js in the console — but read the hazard on the '
        'Forces stage first: its name list is missing five of the fifteen. '
        'The checkpoints below are static, parsed out of force-engine.js at build time.'
    )
    return {"force registrations": {"line": line, "timings": {}, "probe": probe(), "artifacts": {}}}


PANELS = [
  {"cls": "flag", "title": "Two loops, one frame",
   "paras": [
     ("The physics loop.", "d3's <code>timer(step)</code>, started when the simulation object is constructed "
      "and stopped whenever alpha falls below 0.001. Each step cools alpha, runs the fifteen forces in "
      "registration order, integrates, and fires 'tick'."),
     ("The paint loop.", "<code>frame-scheduler.js</code>: one requestAnimationFrame in flight at a time, "
      "callable from anywhere. The sim's tick handler is only one of its callers — pan, zoom, hover, "
      "selection, colour changes and the detail fade all schedule frames with the sim stone cold."),
     ("Why it matters.", "The sim can tick without painting (detailPhase 'none' or 'fading-out'), and the "
      "canvas can repaint without a tick. Neither loop is the other's clock. If you are debugging a frame "
      "that draws stale positions, the question is which loop you are in."),
   ]},
  {"cls": "resume", "title": "The three magic numbers nobody can re-derive",
   "paras": [
     ("HEAT_DECAY = 0.00228", "Ten times slower than d3's default, with the default preserved in a comment "
      "next to it. It turns a 300-tick, ~5 s settle into a ~3000-tick, ~50 s one. Everything about how warm "
      "this viewer feels comes from this line, and nothing explains it."),
     ("LINK_SOFTEN_MIDPOINT = 100000", "Long polychain links have their strength divided by "
      "1 + (arc/100000)², so a link 100 kb long is half as stiff. The exponent, the midpoint and the fact that "
      "it's arc length rather than bp are all uncommented."),
     ("SPAWN_DAMP_TICKS = 18", "New nodes have their velocity scaled by age/18 for their first 18 ticks, to "
      "absorb the charge impulse on spawn. The docstring explains <i>why</i> the force exists (forceManyBody "
      "caches strength per node, so charge can't be ramped through the accessor) — but not why 18."),
   ]},
]
