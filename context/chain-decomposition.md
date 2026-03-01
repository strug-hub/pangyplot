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

## Decomposition Model

When the simplify viewer zooms into c122's region:

1. **Gate check**: any bubble in c122 exceeds the `expand_threshold`?
   The 4 superbubbles have spans 1,101-12,664, so yes at most zoom levels.

2. **Full replacement**: c122 disappears entirely. Every bubble with children
   contributes its child chains. The 391 leaf bubbles produce nothing —
   the skeleton layer underneath shows that structure.

3. **Result**: 12 child chains rendered (c200, c348, c393, c489, c621,
   c123, c196, c221, c540, c600, plus deeper c401, c694 if their parents
   also exceed the threshold).

4. **Recursive**: c489 contains c401 which contains c694 (depth 3).
   The `max_depth=3` limit prevents infinite recursion.

## Key Insight

99% of c122's bubbles (391/395) are tiny leaves. Only 4 superbubbles
contain all the interesting nested structure. This is typical of pangenome
chains: long runs of small variants punctuated by a few large structural
variants that contain complex nested variation.
