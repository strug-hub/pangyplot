#!/usr/bin/env python3
"""
Benchmark script for the PangyPlot data ingestion pipeline.

Runs the full `add` pipeline on the chrY test dataset and reports
per-phase wall-clock times. Designed to measure before/after impact
of optimizations.

Usage:
    python benchmark_ingest.py                  # single run
    python benchmark_ingest.py --runs 3         # average of 3 runs
    python benchmark_ingest.py --save baseline  # save results to file
    python benchmark_ingest.py --compare baseline  # compare against saved results
"""

import argparse
import json
import os
import shutil
import statistics
import sys
import time
from sqlite3 import OperationalError

# ---------------------------------------------------------------------------
# Paths — adjust if your data lives elsewhere
# ---------------------------------------------------------------------------
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "chrY")
GFA_FILE = os.path.join(DATA_DIR, "chrY.gfa")
LAYOUT_FILE = os.path.join(DATA_DIR, "chrY.lay.tsv")
OUTPUT_DIR = "/tmp/pangyplot_bench"
RESULTS_DIR = os.path.join(os.path.dirname(__file__), "benchmark_results")

REF = "GRCh38"
CHR = "chrY"
DB_NAME = "benchmark"


def timed(label):
    """Context manager that records wall-clock seconds for a block."""
    class Timer:
        def __init__(self):
            self.elapsed = 0.0
        def __enter__(self):
            self.start = time.perf_counter()
            return self
        def __exit__(self, *_):
            self.elapsed = time.perf_counter() - self.start
    return Timer()


def run_once():
    """Execute the full ingestion pipeline, return per-phase timings dict."""
    from pangyplot.preprocess.parser.parse_gfa import parse_gfa
    from pangyplot.preprocess.parser.parse_layout import parse_layout
    import pangyplot.preprocess.bubble.bubble_gun as bubble_gun
    from pangyplot.db.indexes.GFAIndex import GFAIndex
    from pangyplot.db.indexes.StepIndex import StepIndex
    from pangyplot.db.indexes.BubbleIndex import BubbleIndex

    chr_path = os.path.join(OUTPUT_DIR, "graphs", DB_NAME, CHR)
    if os.path.exists(chr_path):
        shutil.rmtree(chr_path)
    os.makedirs(chr_path, exist_ok=True)

    timings = {}

    # Phase 1: Parse layout
    with timed("parse_layout") as t:
        layout_coords = parse_layout(LAYOUT_FILE)
    timings["parse_layout"] = t.elapsed

    # Phase 2: Parse GFA (paths + segments + links → SQLite)
    with timed("parse_gfa") as t:
        path_idx, segment_idx, link_idx = parse_gfa(
            GFA_FILE, REF, None, None, "#", layout_coords, chr_path
        )
    timings["parse_gfa"] = t.elapsed

    # Phase 3: Bubble detection
    with timed("bubble_gun") as t:
        bubble_gun.shoot(segment_idx, link_idx, chr_path, REF)
    timings["bubble_gun"] = t.elapsed

    # Phase 4: Index loading (simulates startup)
    with timed("load_gfa_index") as t:
        gfa_index = GFAIndex(chr_path)
    timings["load_gfa_index"] = t.elapsed

    with timed("load_step_index") as t:
        step_index = StepIndex(chr_path, REF)
    timings["load_step_index"] = t.elapsed

    with timed("load_bubble_index") as t:
        bubble_index = BubbleIndex(chr_path, gfa_index)
    timings["load_bubble_index"] = t.elapsed

    timings["total"] = sum(timings.values())
    return timings


def print_results(all_runs):
    """Print a table of per-phase timings, with median and stddev if >1 run."""
    phases = list(all_runs[0].keys())
    n = len(all_runs)

    header_run_cols = "".join(f"  {'Run ' + str(i+1):>8s}" for i in range(n))
    header = f"{'Phase':<22s}{header_run_cols}"
    if n > 1:
        header += f"  {'Median':>8s}  {'StdDev':>8s}"
    print(header)
    print("-" * len(header))

    for phase in phases:
        vals = [run[phase] for run in all_runs]
        row = f"{phase:<22s}"
        for v in vals:
            row += f"  {v:>7.3f}s"
        if n > 1:
            med = statistics.median(vals)
            sd = statistics.stdev(vals) if n > 2 else 0.0
            row += f"  {med:>7.3f}s  {sd:>7.3f}s"
        print(row)


def save_results(all_runs, name):
    """Save results to a JSON file for later comparison."""
    os.makedirs(RESULTS_DIR, exist_ok=True)
    path = os.path.join(RESULTS_DIR, f"{name}.json")

    # Store per-phase medians
    phases = list(all_runs[0].keys())
    medians = {}
    for phase in phases:
        vals = [run[phase] for run in all_runs]
        medians[phase] = statistics.median(vals)

    data = {
        "name": name,
        "runs": len(all_runs),
        "medians": medians,
        "raw": all_runs,
    }
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"\nResults saved to {path}")


def compare_results(all_runs, baseline_name):
    """Compare current results against a saved baseline."""
    path = os.path.join(RESULTS_DIR, f"{baseline_name}.json")
    if not os.path.exists(path):
        print(f"Error: no saved results at {path}")
        sys.exit(1)

    with open(path) as f:
        baseline = json.load(f)

    phases = list(all_runs[0].keys())
    current_medians = {}
    for phase in phases:
        vals = [run[phase] for run in all_runs]
        current_medians[phase] = statistics.median(vals)

    base_medians = baseline["medians"]

    print(f"\nComparison vs '{baseline_name}' ({baseline['runs']} runs):")
    print(f"{'Phase':<22s}  {'Baseline':>8s}  {'Current':>8s}  {'Diff':>8s}  {'Change':>8s}")
    print("-" * 72)

    for phase in phases:
        base_val = base_medians.get(phase, 0)
        curr_val = current_medians[phase]
        diff = curr_val - base_val
        if base_val > 0:
            pct = (diff / base_val) * 100
            change = f"{pct:+.1f}%"
        else:
            change = "n/a"
        print(f"{phase:<22s}  {base_val:>7.3f}s  {curr_val:>7.3f}s  {diff:>+7.3f}s  {change:>8s}")


def main():
    global GFA_FILE, LAYOUT_FILE, OUTPUT_DIR, REF, CHR, DB_NAME

    parser = argparse.ArgumentParser(description="Benchmark PangyPlot ingestion")
    parser.add_argument("--runs", type=int, default=1, help="Number of runs (default: 1)")
    parser.add_argument("--save", type=str, help="Save results with this name")
    parser.add_argument("--compare", type=str, help="Compare against saved results")
    parser.add_argument("--gfa", type=str, help=f"GFA to ingest (default: {GFA_FILE})")
    parser.add_argument("--layout", type=str, help=f"odgi layout TSV (default: {LAYOUT_FILE})")
    parser.add_argument("--outdir", type=str,
                        help=f"Where to write the datastore (default: {OUTPUT_DIR})")
    parser.add_argument("--ref", type=str, default=REF, help=f"Reference name (default: {REF})")
    parser.add_argument("--chr", type=str, default=CHR, help=f"Chromosome (default: {CHR})")
    parser.add_argument("--db", type=str, default=DB_NAME, help=f"DB name (default: {DB_NAME})")
    args = parser.parse_args()

    if args.gfa:
        GFA_FILE = args.gfa
    if args.layout:
        LAYOUT_FILE = args.layout
    if args.outdir:
        OUTPUT_DIR = args.outdir
    REF, CHR, DB_NAME = args.ref, args.chr, args.db

    # Validate data files exist
    for path, label in [(GFA_FILE, "GFA"), (LAYOUT_FILE, "Layout")]:
        if not os.path.exists(path):
            print(f"Error: {label} file not found: {path}")
            sys.exit(1)

    print(f"Benchmark: {os.path.basename(GFA_FILE)} ({os.path.getsize(GFA_FILE) / 1024**2:.1f} MB)")
    print(f"Runs: {args.runs}")
    print()

    all_runs = []
    for i in range(args.runs):
        if args.runs > 1:
            print(f"--- Run {i + 1}/{args.runs} ---")
        timings = run_once()
        all_runs.append(timings)
        if args.runs > 1:
            print()

    print_results(all_runs)

    if args.save:
        save_results(all_runs, args.save)

    if args.compare:
        compare_results(all_runs, args.compare)


if __name__ == "__main__":
    main()
