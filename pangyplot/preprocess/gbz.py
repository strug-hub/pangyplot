"""GBZ adoption for ingest (GBWT migration Stage 3).

`pangyplot add --gbz <path>` drops a user-supplied `graph.gbz` into the
chromosome directory — the filename GbwtManager looks for. PangyPlot does not
build GBZs itself (GBZ *construction* lives in the C++ vg/gbwt toolchain;
gbwt-rs is a reader). Users build the GBZ with vg however they like and hand it
in. Adopting is opt-in; without it, ingest is unchanged and the app runs on the
legacy binpath engine.

THE CONTRACT (see context/gbwt-migration.md): the GBZ must expose PangyPlot's
compact segment ids at the segment level. vg chops long segments but records a
node->segment translation, and the graphd walks via `segment_path`, so a GBZ
built from the *same* GFA whose segments/links/bubbles were ingested satisfies
the contract. A user-supplied GBZ must carry integer segment names (chopped
GBZs always do; unchopped means node = segment).
"""
import os
import shutil

GBZ_NAME = "graph.gbz"


def gbz_path(chr_dir):
    return os.path.join(chr_dir, GBZ_NAME)


def adopt_gbz(src_gbz, chr_dir):
    """Copy a user-supplied GBZ to `<chr_dir>/graph.gbz`. Returns its path.

    The caller is responsible for the segment-id contract: the GBZ must come
    from the same graph as the GFA whose segments/links/bubbles were ingested.
    """
    if not os.path.exists(src_gbz):
        raise RuntimeError(f"GBZ not found: {src_gbz}")
    out = gbz_path(chr_dir)
    if os.path.abspath(src_gbz) != os.path.abspath(out):
        shutil.copyfile(src_gbz, out)
    return out
