"""Shared logger helpers for `pangyplot add` preprocessing output.

Four shapes match the CLI hierarchy:
  section(msg)        -> "→ {msg}" + closing "← {msg}: total X.Xs" (context manager)
  header(msg)         -> "→ {msg}"                              (no timing, no context)
  info(emoji, msg)    -> "   {emoji} {msg}"                      (no timing)
  step(emoji, msg)    -> "   {emoji} {msg}... Done. Took {x:.1f} seconds." (context manager)
  summary(msg)        -> "      {msg}"                           (stat line under a step)

Every `section` and `step` enter also records its duration into the
module-level `_timings` list so callers can dump a timings.tsv via
`write_timings(path)`. `reset_timings()` clears state for a new run.
"""

import resource
import time
from contextlib import contextmanager


_timings = []        # list of (key, seconds[, peak_gb]) in order produced
_section_stack = []  # list of active section names, for hierarchical keys


def _peak_gb():
    """Peak resident set size of this process and its children, in GB."""
    peak_kb = max(
        resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss,
    )
    return peak_kb / (1024 ** 2)


def _key(name):
    return "/".join(_section_stack + [name]) if _section_stack else name


def header(msg):
    print(f"→ {msg}", flush=True)


def info(emoji, msg):
    print(f"   {emoji} {msg}", flush=True)


def summary(msg):
    print(f"      {msg}", flush=True)


@contextmanager
def section(msg, key=None):
    """Timed section. `key` is the short timing-file label (defaults to
    a slug of `msg`)."""
    print(f"→ {msg}", flush=True)
    k = key or _slug(msg)
    full_key = _key(k)
    _section_stack.append(k)
    t0 = time.time()
    try:
        yield
    finally:
        elapsed = time.time() - t0
        _section_stack.pop()
        _timings.append((full_key, elapsed))
        label = msg.rstrip(".")
        print(f"← {label}: total {elapsed:.1f}s.", flush=True)


@contextmanager
def step(emoji, msg, key=None):
    print(f"   {emoji} {msg}...", end="", flush=True)
    k = key or _slug(msg)
    full_key = _key(k)
    t0 = time.time()
    try:
        yield
    finally:
        elapsed = time.time() - t0
        _timings.append((full_key, elapsed))
        print(f" Done. Took {elapsed:.1f} seconds.")


def _slug(msg):
    """Turn a display message into a short, stable timing-key slug."""
    s = msg.strip().rstrip(".").lower()
    # Drop anything past the first colon (e.g. file paths in "Parsing GFA file: x.gfa")
    s = s.split(":", 1)[0].strip()
    return "_".join(s.split())


def reset_timings():
    _timings.clear()
    _section_stack.clear()


def write_timings(path):
    """Dump recorded timings to `path` as key\\tseconds, with an optional
    third peak-memory (GB) column on entries that recorded one."""
    with open(path, "w") as f:
        for entry in _timings:
            key, seconds = entry[0], entry[1]
            row = f"{key}\t{seconds:.3f}"
            if len(entry) > 2:
                row += f"\t{entry[2]:.3f}"
            f.write(row + "\n")
