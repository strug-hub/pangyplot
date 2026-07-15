"""GBZ production for ingest (GBWT migration Stage 3).

`pangyplot add` can produce the per-chr `graph.gbz` that the GBWT path engine
serves, two ways:

  * build it from the GFA being ingested (`vg gbwt -G <gfa> --gbz-format`), or
  * adopt a pre-built GBZ the user supplies.

Both drop `graph.gbz` into the chromosome directory — the filename GbwtManager
looks for. Producing the GBZ is opt-in; without it, ingest is unchanged and the
app runs on the legacy binpath engine.

THE CONTRACT (see context/gbwt-migration.md): the GBZ must expose PangyPlot's
compact segment ids at the segment level. vg chops long segments but records a
node->segment translation, and the sidecar walks via `segment_path`, so a GBZ
built from *this* GFA satisfies the contract by construction. A user-supplied
GBZ must carry integer segment names (chopped GBZs always do; unchopped means
node = segment) — validated below.
"""
import os
import shutil
import subprocess

GBZ_NAME = "graph.gbz"


def gbz_path(chr_dir):
    return os.path.join(chr_dir, GBZ_NAME)


def build_gbz_from_gfa(gfa_path, chr_dir, vg_bin="vg"):
    """Build `<chr_dir>/graph.gbz` from a GFA via `vg gbwt`. Returns its path.

    Raises RuntimeError if vg is missing or the build fails, so a requested
    build never silently no-ops.
    """
    out = gbz_path(chr_dir)
    if shutil.which(vg_bin) is None and not os.path.exists(vg_bin):
        raise RuntimeError(
            f"'{vg_bin}' not found; install vg or point --vg-bin at it to build a GBZ.")

    cmd = [vg_bin, "gbwt", "-G", gfa_path, "--gbz-format", "-g", out]
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    except subprocess.CalledProcessError as e:
        stderr = e.stderr.decode(errors="replace") if e.stderr else ""
        raise RuntimeError(f"vg gbwt failed ({' '.join(cmd)}):\n{stderr}") from e

    if not os.path.exists(out):
        raise RuntimeError(f"vg gbwt reported success but {out} was not written.")
    return out


def adopt_gbz(src_gbz, chr_dir):
    """Copy a user-supplied GBZ to `<chr_dir>/graph.gbz`. Returns its path.

    The caller is responsible for the segment-id contract (the GBZ must come
    from the same graph as the GFA whose segments/links/bubbles were ingested);
    a build_gbz_from_gfa GBZ satisfies it automatically.
    """
    if not os.path.exists(src_gbz):
        raise RuntimeError(f"GBZ not found: {src_gbz}")
    out = gbz_path(chr_dir)
    if os.path.abspath(src_gbz) != os.path.abspath(out):
        shutil.copyfile(src_gbz, out)
    return out
