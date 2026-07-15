"""Native GBWT production for ingest (GBWT migration Stage 3).

Builds `<chr_dir>/graph.gbwt` — the compact, node=segment GBWT the path engine
serves — with no vg. Python owns path semantics: it emits a small binary
"pathdata" intermediate from the paths it already parsed (`combined` node handles
+ per-subpath metadata), and the native Rust `gbwt-build` binary turns that into
a GBWT. The intermediate is a transient build artifact, removed after the build.

Why this is not a lock-in for later GBZ-style node/link serving (Stage 5): a GBWT
already encodes graph topology (edges live in its records), and PangyPlot already
owns every segment's DNA in SegmentIndex — so a compact GBWT + SegmentIndex is
functionally a compact GBZ. The GBWT is a strict subset we can extend later
without changing the (compact) node-id space.

pathdata format — see tools/gbwt-build/src/main.rs (single source of truth).
"""
import os
import shutil
import struct
import subprocess

import numpy as np

import pangyplot.db.sqlite.path_db as path_db
from pangyplot.db.path_codec import read_path_index, read_binpath_combined

GBWT_NAME = "graph.gbwt"
PATHDATA_NAME = "paths.gbwtbuild"
DEFAULT_BUILDER = os.path.join("tools", "gbwt-build", "target", "release", "gbwt-build")


def gbwt_path(chr_dir):
    return os.path.join(chr_dir, GBWT_NAME)


def _split_sample_hap(full_id):
    """PangyPlot sample name + haplotype from a path's full id (PanSN-ish).

    `sample#hap#...` -> ("sample", hap:int); no `#` -> (full_id, 0). Mirrors how
    PathIndex/create_path derive sample and hap from full_id.
    """
    parts = full_id.split("#")
    sample = parts[0]
    hap = 0
    if len(parts) > 1 and parts[1].isdigit():
        hap = int(parts[1])
    return sample, hap


def _iter_path_records(chr_dir):
    """Yield (sample, contig, haplotype, fragment, combined) for every subpath,
    read from the parsed binpaths + index.json (the canonical parse output)."""
    paths_dir = os.path.join(chr_dir, path_db.DB_NAME)
    index = read_path_index(paths_dir)
    for sample_key, entries in index.get("paths", {}).items():
        for entry in entries:
            full_id = entry.get("full_id") or sample_key
            sample, hap = _split_sample_hap(full_id)
            contig = entry.get("contig") or ""
            try:
                fragment = int(entry.get("start"))
            except (TypeError, ValueError):
                fragment = 0
            combined = read_binpath_combined(os.path.join(paths_dir, entry["file"]))
            yield sample, contig, hap, fragment, combined


def emit_pathdata(chr_dir):
    """Write the pathdata intermediate. Returns (path, n_paths)."""
    out = os.path.join(chr_dir, PATHDATA_NAME)
    records = list(_iter_path_records(chr_dir))
    with open(out, "wb") as f:
        f.write(b"PPGB")
        f.write(struct.pack("<I", 1))             # version
        f.write(struct.pack("<Q", len(records)))  # num_paths
        for sample, contig, hap, frag, combined in records:
            sb = sample.encode("utf-8")
            cb = contig.encode("utf-8")
            f.write(struct.pack("<I", len(sb)))
            f.write(sb)
            f.write(struct.pack("<I", len(cb)))
            f.write(cb)
            f.write(struct.pack("<Q", hap))
            f.write(struct.pack("<Q", frag))
            arr = np.asarray(combined, dtype="<i8")
            f.write(struct.pack("<Q", int(arr.size)))
            f.write(arr.tobytes())
    return out, len(records)


def _resolve_builder(builder_bin, repo_root):
    builder_bin = builder_bin or DEFAULT_BUILDER
    if repo_root and not os.path.isabs(builder_bin):
        builder_bin = os.path.join(repo_root, builder_bin)
    if shutil.which(builder_bin) is None and not os.path.exists(builder_bin):
        raise RuntimeError(
            f"gbwt-build binary not found at {builder_bin} "
            f"(cargo build --release --manifest-path tools/gbwt-build/Cargo.toml)")
    return builder_bin


def build_gbwt(chr_dir, builder_bin=None, repo_root=None):
    """Emit the intermediate and run the native builder -> graph.gbwt.

    Returns the graph.gbwt path. Raises RuntimeError if the builder is missing or
    fails. The intermediate is always cleaned up.
    """
    builder_bin = _resolve_builder(builder_bin, repo_root)
    pathdata, n = emit_pathdata(chr_dir)
    out = gbwt_path(chr_dir)
    try:
        subprocess.run([builder_bin, pathdata, out], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    except subprocess.CalledProcessError as e:
        stderr = e.stderr.decode(errors="replace") if e.stderr else ""
        raise RuntimeError(f"gbwt-build failed:\n{stderr}") from e
    finally:
        if os.path.exists(pathdata):
            os.remove(pathdata)

    if not os.path.exists(out):
        raise RuntimeError(f"gbwt-build reported success but {out} was not written.")
    return out
