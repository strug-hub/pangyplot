"""Shared logger helpers for `pangyplot add` preprocessing output.

Three shapes match the existing CLI hierarchy:
  header(msg)         -> "→ {msg}"
  info(emoji, msg)    -> "   {emoji} {msg}"            (no timing)
  step(emoji, msg)    -> "   {emoji} {msg}... Done. Took {x:.1f} seconds."  (context manager)
  summary(msg)        -> "      {msg}"                 (stat line, nested under a step)
"""

import time
from contextlib import contextmanager


def header(msg):
    print(f"→ {msg}", flush=True)


def info(emoji, msg):
    print(f"   {emoji} {msg}", flush=True)


def summary(msg):
    print(f"      {msg}", flush=True)


@contextmanager
def step(emoji, msg):
    print(f"   {emoji} {msg}...", end="", flush=True)
    t0 = time.time()
    try:
        yield
    finally:
        print(f" Done. Took {time.time() - t0:.1f} seconds.")
