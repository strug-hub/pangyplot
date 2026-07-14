#!/usr/bin/env python3
"""Per-phase memory profiler for the preprocessing pipeline.

`/usr/bin/time -v` gives one peak-RSS number for the whole run, which says
nothing about *which* phase owns it. This samples RSS from outside the process
and attributes the peak to phases, so you can tell whether memory scales with
node count or with path-step count -- the difference between a chromosome
fitting in RAM and not.

It drives the pipeline as a subprocess and reconstructs phase windows from the
log stream, so it needs no hooks in the pipeline itself and works unchanged on
any implementation of it (including a native one).

Usage:
    python benchmark_memory.py --gfa X.gfa --layout X.lay.tsv --chr chrY \
        --ref GRCh38 --outdir /tmp/ds [--nodes 1046775 --steps 54342183]

    python benchmark_memory.py --save chrY_v2 ...      # write JSON
    python benchmark_memory.py --cmd "some-binary ..." # profile anything
"""

import argparse
import json
import os
import re
import shlex
import subprocess
import sys
import threading
import time

import psutil

POLL_SECONDS = 0.05
RESULTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           "benchmark_results")

# "   🔫 Loading BubbleGun... Done. Took 14.3 seconds."  -> emitted when the step ENDS
STEP_RE = re.compile(r"^\s+\S+\s+(?P<name>.+?)\.\.\..*Done\. Took (?P<secs>[\d.]+) seconds")
# "← Finding bubbles: total 53.5s."                      -> emitted when the section ENDS
SECTION_RE = re.compile(r"^←\s*(?P<name>.+?):\s*total\s*(?P<secs>[\d.]+)s")


def _tree_rss(proc):
    """Resident bytes for proc + all descendants. 0 once it's gone."""
    total = 0
    try:
        total = proc.memory_info().rss
        for child in proc.children(recursive=True):
            try:
                total += child.memory_info().rss
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        return 0
    return total


def _sample(proc, samples, stop):
    """Append (elapsed, rss_bytes) until stop is set."""
    t0 = time.perf_counter()
    while not stop.is_set():
        rss = _tree_rss(proc)
        if rss:
            samples.append((time.perf_counter() - t0, rss))
        time.sleep(POLL_SECONDS)


def _read_log(pipe, events, echo):
    """Timestamp each log line. Phase-end lines carry their own duration."""
    t0 = time.perf_counter()
    for line in pipe:
        now = time.perf_counter() - t0
        if echo:
            sys.stdout.write(line)
        m = STEP_RE.match(line)
        kind = "step"
        if not m:
            m = SECTION_RE.match(line)
            kind = "section"
        if m:
            dur = float(m.group("secs"))
            events.append({
                "name": m.group("name").strip(),
                "kind": kind,
                "start": now - dur,   # the line lands when the phase ends
                "end": now,
                "seconds": dur,
            })
    pipe.close()


def profile(cmd, echo=False):
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, bufsize=1)
    ps = psutil.Process(proc.pid)

    samples, events, stop = [], [], threading.Event()
    sampler = threading.Thread(target=_sample, args=(ps, samples, stop), daemon=True)
    reader = threading.Thread(target=_read_log, args=(proc.stdout, events, echo), daemon=True)
    sampler.start()
    reader.start()

    rc = proc.wait()
    reader.join(timeout=10)
    stop.set()
    sampler.join(timeout=5)
    return rc, samples, events


def peak_in(samples, start, end):
    """Max RSS observed inside [start, end], and RSS at the window's start."""
    inside = [rss for t, rss in samples if start <= t <= end]
    if not inside:
        return None, None
    before = [rss for t, rss in samples if t <= start]
    return max(inside), (before[-1] if before else inside[0])


def main():
    p = argparse.ArgumentParser(description="Per-phase memory profile of preprocessing")
    p.add_argument("--cmd", help="Full command to profile (overrides the add args)")
    p.add_argument("--gfa"); p.add_argument("--layout")
    p.add_argument("--chr", default="chrY"); p.add_argument("--ref", default="GRCh38")
    p.add_argument("--db", default="bench"); p.add_argument("--outdir", default="/tmp/pangyplot_mem")
    p.add_argument("--nodes", type=int, help="node count, for per-node cost")
    p.add_argument("--steps", type=int, help="path-step count, for per-step cost")
    p.add_argument("--save", help="write benchmark_results/<name>.memory.json")
    p.add_argument("--echo", action="store_true", help="echo the pipeline's own output")
    args = p.parse_args()

    if args.cmd:
        cmd = shlex.split(args.cmd)
    else:
        if not (args.gfa and args.layout):
            p.error("--gfa and --layout are required (or pass --cmd)")
        cmd = [sys.executable, "pangyplot.py", "add", "--dir", args.outdir,
               "--db", args.db, "--ref", args.ref, "--chr", args.chr,
               "--gfa", args.gfa, "--layout", args.layout, "--force"]

    print(f"profiling: {' '.join(cmd)}\n", flush=True)
    rc, samples, events = profile(cmd, echo=args.echo)
    if rc != 0:
        print(f"\n!! command exited {rc}", file=sys.stderr)
    if not samples:
        print("no samples collected", file=sys.stderr)
        return 1

    peak = max(rss for _, rss in samples)
    peak_t = next(t for t, rss in samples if rss == peak)
    GB = 1 << 30

    print(f"\n{'phase':<44} {'peak RSS':>10} {'delta':>9} {'time':>8}")
    print("-" * 74)
    rows = []
    for ev in events:
        hi, before = peak_in(samples, ev["start"], ev["end"])
        if hi is None:
            continue
        delta = hi - before
        indent = "  " if ev["kind"] == "step" else ""
        mark = " <-- PEAK" if ev["start"] <= peak_t <= ev["end"] and ev["kind"] == "step" else ""
        print(f"{indent}{ev['name'][:42-len(indent)]:<{44-len(indent)}} "
              f"{hi/GB:>9.2f}G {delta/GB:>+8.2f}G {ev['seconds']:>7.1f}s{mark}")
        rows.append({**ev, "peak_bytes": hi, "delta_bytes": delta})

    print("-" * 74)
    print(f"{'PEAK RSS':<44} {peak/GB:>9.2f}G   at t={peak_t:.0f}s")

    if args.nodes:
        print(f"{'per node':<44} {peak/args.nodes:>9.0f} B")
    if args.steps:
        print(f"{'per path-step':<44} {peak/args.steps:>9.0f} B")

    if args.save:
        os.makedirs(RESULTS_DIR, exist_ok=True)
        out = os.path.join(RESULTS_DIR, f"{args.save}.memory.json")
        with open(out, "w") as f:
            json.dump({
                "cmd": cmd, "peak_bytes": peak, "peak_at_seconds": peak_t,
                "nodes": args.nodes, "steps": args.steps,
                "phases": rows,
                "timeline": [(round(t, 2), rss) for t, rss in samples],
            }, f, indent=2)
        print(f"\nsaved {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
