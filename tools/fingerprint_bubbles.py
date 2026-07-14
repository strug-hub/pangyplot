#!/usr/bin/env python3
"""Canonical fingerprint of a bubbles.db, for diffing two implementations.

`shoot()`'s return value is discarded by every caller, so bubbles.db is the
*entire* observable output of bubble detection. If two implementations produce
the same fingerprint, they are indistinguishable to everything downstream.

This is only meaningful because bubble/chain ids are deterministic (bd5914ff).
Before that commit the ids permuted on every build and no such diff existed.

    python tools/fingerprint_bubbles.py <chr_dir>              # one hash
    python tools/fingerprint_bubbles.py <dir_a> <dir_b>        # diff two
    python tools/fingerprint_bubbles.py <dir_a> <dir_b> -v     # show mismatches
"""

import argparse
import hashlib
import json
import os
import sqlite3
import sys

# Element order here is an implementation detail (these come from Python sets),
# so sort before hashing or a faithful reimplementation would "fail" on ordering
# alone.
SET_COLUMNS = ("children", "inside")
# [primary_node, *compacted_nodes]: the head identifies the node and must be
# compared positionally; the compacted tail is set-derived, so normalize it.
HEAD_TAIL_COLUMNS = ("source", "sink")
# Order IS meaningful and must not be touched: `siblings` is a positional
# [prev, next] pair (either may be null), and the range columns are emitted
# ascending by collapse_ranges.
VERBATIM_COLUMNS = ("siblings", "range_exclusive", "range_inclusive")
FLOAT_COLUMNS = ("x1", "x2", "y1", "y2")


def canonical_rows(db_path):
    """Yield (id, canonical_json) for every bubble, in id order."""
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    cur = conn.execute("SELECT * FROM bubbles ORDER BY id")
    for row in cur:
        d = dict(row)
        for col in SET_COLUMNS:
            if d.get(col):
                d[col] = sorted(json.loads(d[col]))
        for col in HEAD_TAIL_COLUMNS:
            if d.get(col):
                vals = json.loads(d[col])
                d[col] = vals[:1] + sorted(vals[1:])
        for col in VERBATIM_COLUMNS:
            if d.get(col):
                d[col] = json.loads(d[col])
        for col in FLOAT_COLUMNS:
            if d.get(col) is not None:
                # layout coords are float32 upstream; don't let float64 print
                # noise masquerade as a real difference
                d[col] = round(float(d[col]), 4)
        yield d["id"], json.dumps(d, sort_keys=True, separators=(",", ":"))
    conn.close()


def fingerprint(chr_dir):
    """(sha256, bubble_count) for the bubbles.db in chr_dir."""
    db_path = os.path.join(chr_dir, "bubbles.db")
    if not os.path.exists(db_path):
        sys.exit(f"no bubbles.db in {chr_dir}")
    h = hashlib.sha256()
    n = 0
    for _, blob in canonical_rows(db_path):
        h.update(blob.encode())
        n += 1
    return h.hexdigest()[:16], n


def diff(dir_a, dir_b, verbose, limit):
    a = dict(canonical_rows(os.path.join(dir_a, "bubbles.db")))
    b = dict(canonical_rows(os.path.join(dir_b, "bubbles.db")))

    only_a = sorted(set(a) - set(b))
    only_b = sorted(set(b) - set(a))
    differing = sorted(i for i in set(a) & set(b) if a[i] != b[i])

    if not (only_a or only_b or differing):
        print(f"IDENTICAL — {len(a)} bubbles match exactly")
        return 0

    print(f"MISMATCH  bubbles: {len(a)} vs {len(b)}")
    if only_a:
        print(f"  only in A: {len(only_a)}  e.g. {only_a[:8]}")
    if only_b:
        print(f"  only in B: {len(only_b)}  e.g. {only_b[:8]}")
    if differing:
        print(f"  differing: {len(differing)}  e.g. {differing[:8]}")

    if verbose:
        for i in differing[:limit]:
            ra, rb = json.loads(a[i]), json.loads(b[i])
            fields = [k for k in ra if ra[k] != rb.get(k)]
            print(f"\n  bubble {i}: fields differ: {fields}")
            for k in fields:
                print(f"    {k}:\n      A: {ra[k]}\n      B: {rb.get(k)}")
    return 1


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("dirs", nargs="+", metavar="CHR_DIR",
                   help="one dir to fingerprint, two to diff")
    p.add_argument("-v", "--verbose", action="store_true",
                   help="show field-level diffs")
    p.add_argument("--limit", type=int, default=5,
                   help="max differing bubbles to detail (default 5)")
    args = p.parse_args()

    if len(args.dirs) == 1:
        h, n = fingerprint(args.dirs[0])
        print(f"{h}  {n} bubbles  {args.dirs[0]}")
        return 0
    if len(args.dirs) == 2:
        for d in args.dirs:
            h, n = fingerprint(d)
            print(f"{h}  {n} bubbles  {d}")
        print()
        return diff(args.dirs[0], args.dirs[1], args.verbose, args.limit)
    p.error("pass one dir (fingerprint) or two (diff)")


if __name__ == "__main__":
    sys.exit(main())
