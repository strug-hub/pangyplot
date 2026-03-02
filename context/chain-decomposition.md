# Chain Decomposition: c122 Case Study (chrY, hprc.clip)

Reference analysis of chain c122 in the DAZ1 region (~23.1M-23.2M bp on chrY).
Used to debug and validate the simplify viewer's chain expansion logic.

## Chain c122 Direct Structure

- **395 direct bubbles**
- **4 parent bubbles** (superbubbles with children)
- **391 leaf bubbles** (no children, span 0-35 layout units)

The leaf bubbles are tiny simple/insertion variants that form the linear backbone
between the 4 large superbubbles. They are not expandable.

## The 4 Parent Bubbles

| Bubble | Subtype | Layout Span | Length (bp) | Children | Child Chains |
|--------|---------|-------------|-------------|----------|--------------|
| b7827  | super   | 12,664      | 25,139      | 31       | c200, c348, c393 |
| b7862  | super   | 5,569       | 9,729       | 157      | c489 |
| b7933  | super   | 1,101       | 6,732       | 98       | c621 |
| b7968  | super   | 9,973       | 23,961      | 106      | c123, c196, c221, c540, c600 |

## Full Nesting Hierarchy

```
c122 (395 bubbles: 391 leaf + 4 super)
│
├── [391 leaf bubbles — linear backbone, shown by skeleton layer]
│
├── b7827 (span=12,664)
│   ├── c200  (6 bubbles, all leaf)
│   ├── c348  (9 bubbles, all leaf)
│   └── c393  (16 bubbles, all leaf)
│
├── b7862 (span=5,569)
│   └── c489  (157 bubbles, 156 leaf + 1 parent)
│       └── b48879 inside c489
│           └── c401  (7 bubbles, 1 parent + 6 leaf)
│               └── b43820 inside c401
│                   └── c694  (4 bubbles, all leaf)
│
├── b7933 (span=1,101)
│   └── c621  (98 bubbles, all leaf)
│
└── b7968 (span=9,973)
    ├── c123  (58 bubbles, all leaf)
    ├── c196  (3 bubbles, all leaf)
    ├── c221  (4 bubbles, all leaf)
    ├── c540  (40 bubbles, all leaf)
    └── c600  (1 bubble, leaf)
```

## Aggregate Statistics

| Metric | Value |
|--------|-------|
| Total bubbles (all descendants) | 798 |
| Leaf bubbles | 792 |
| Parent bubbles | 6 (4 in c122, 1 in c489, 1 in c401) |
| Unique chains | 13 |
| Max nesting depth | 3 |

### Bubbles per depth level

| Depth | Bubbles | Description |
|-------|---------|-------------|
| 0     | 395     | Direct members of c122 |
| 1     | 392     | Inside b7827, b7862, b7933, b7968 |
| 2     | 7       | Inside c489's parent bubble |
| 3     | 4       | Inside c401's parent bubble (deepest) |

## Progressive Detail Model

Three mechanisms control what the simplify viewer shows as the user zooms in.
Each is gated by a threshold derived from the viewport width in layout units.

### 1. Chain Decomposition (`expand_threshold = viewport / 10`)

When any bubble in a chain exceeds `expand_threshold`, the parent chain is
replaced by child chains from inside its superbubbles. Only one level of
hierarchy is revealed per zoom step — child chains are returned as-is, not
recursively decomposed.

**Gate check**: any bubble in c122 exceeds the threshold?
The 4 superbubbles have spans 1,101-12,664, so yes at most zoom levels.

**Result**: c122 disappears. Each superbubble with children contributes its
child chains: c200, c348, c393 (from b7827), c489 (from b7862), c621 (from
b7933), c123, c196, c221, c540, c600 (from b7968).

**Single-level**: Decomposition does not recurse. c489 (which contains c401
containing c694) is returned as-is at depth 1. A second zoom step would
decompose c489 into c401 + c694.

**`max_depth=3`** prevents infinite recursion for deeply nested hierarchies.

### 2. Connector Lines (dashed, from leaf-bubble runs)

When a chain is decomposed, the runs of leaf bubbles between the expanded
superbubbles are emitted as **connector** chain entries with `"connector": true`.
These render as thin gray dashed polylines showing the linear backbone that
connects the child chain regions.

For c122, this produces 5 connectors:
- `c122_r0`: 40 leaf bubbles before b7827
- `c122_r1`: 34 leaf bubbles between b7827 and b7862
- `c122_r2`: 70 leaf bubbles between b7862 and b7933
- `c122_r3`: 34 leaf bubbles between b7933 and b7968
- `c122_r4`: 80 leaf bubbles after b7968

### 3. Bubble Exposure (`bubble_threshold = viewport / 8`)

When a chain's layout span exceeds `bubble_threshold`, it is replaced by its
individual leaf bubbles rendered as colored ellipses (blue=simple, pink=super,
green=insertion). Superbubbles with children are skipped — they are intermediate
hierarchy nodes that decompose into child chains on further zoom.

Each bubble has a minimum 4px screen radius for visibility. Hover hit-testing
uses an ellipse containment check with a margin for easier targeting.

### Typical zoom progression for c122

| Zoom Level | What's Shown |
|-----------|--------------|
| Far out | c122 as a single polyline |
| Medium | c122 decomposed: 10 child chains (solid blue) + 5 connectors (dashed gray) |
| Closer | Large child chains (c489, c123, c393) replaced by exposed leaf bubbles |
| Very close | All chains replaced by individual bubble ellipses |

## Key Insight

99% of c122's bubbles (391/395) are tiny leaves. Only 4 superbubbles
contain all the interesting nested structure. This is typical of pangenome
chains: long runs of small variants punctuated by a few large structural
variants that contain complex nested variation.
