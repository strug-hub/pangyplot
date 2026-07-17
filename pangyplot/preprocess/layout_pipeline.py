"""Run the vg/odgi preprocessing steps directly, via subprocess.

`pangyplot preprocess` (interactive) *generates* a shell script because a bare
install can't assume vg/odgi exist or know where they live. The container ships
the whole toolchain, so there the steps can just be executed — that is what
`pangyplot preprocess --run` uses this module for.

The pipeline mirrors the manual recipe in the docs (Preparing Data):

    (vg convert --no-wline)   # only for .vg input (odgi can't read W-lines)
    odgi build -O -g ... -o unsorted.og
    odgi sort  --optimize -Y [-H paths.txt] -i unsorted.og -o sorted.og
    odgi layout -i sorted.og --tsv PREFIX.lay.tsv -o PREFIX.lay [--gpu]
    odgi view  -i sorted.og -g > PREFIX.sorted.gfa

and yields (sorted_gfa, layout_tsv) — exactly the pair `pangyplot add` wants.
"""
import os
import shutil
import subprocess


class ToolMissing(Exception):
    """A required external tool (vg/odgi/odgi_gpu/gunzip) was not found on PATH."""
    def __init__(self, name):
        super().__init__(name)
        self.name = name


def _tool(name, which):
    path = which(name)
    if not path:
        raise ToolMissing(name)
    return path


def _default_runner(argv, stdout=None, description=None):
    if description:
        shown = " ".join(argv) + (f" > {stdout}" if stdout else "")
        print(f"\n>>> {description}\n    $ {shown}", flush=True)
    out = open(stdout, "wb") if stdout else None
    try:
        subprocess.run(argv, stdout=out, check=True)
    finally:
        if out:
            out.close()


def _default_capture(argv):
    return subprocess.run(argv, capture_output=True, text=True, check=True).stdout


def strip_graph_ext(name):
    """Prefix for output files, derived from an input basename (drops .vg/.gfa/.og/.gz)."""
    base = os.path.basename(name)
    for ext in (".gz", ".gfa", ".og", ".vg"):
        if base.lower().endswith(ext):
            base = base[: -len(ext)]
    return base


def run_layout_pipeline(*, input_file, output_dir, prefix=None, paths=None,
                        threads=4, gpu=False, sort=True,
                        which=shutil.which, runner=None, capture=None):
    """Execute the vg/odgi pipeline. Returns (sorted_gfa_path, layout_tsv_path).

    Raises ToolMissing if a needed tool is absent, ValueError on an unrecognized
    input extension, or subprocess.CalledProcessError if a step exits non-zero.
    `which`/`runner`/`capture` are injectable for testing.
    """
    runner = runner or _default_runner
    capture = capture or _default_capture
    prefix = prefix or strip_graph_ext(input_file)
    paths = paths or []
    t = str(threads)

    os.makedirs(output_dir, exist_ok=True)
    pfx = os.path.join(output_dir, prefix)

    # odgi (and its GPU sibling for the layout step only) are always needed.
    odgi = _tool(os.environ.get("ODGI", "odgi"), which)
    odgi_layout = _tool(os.environ.get("ODGI_GPU", "odgi_gpu"), which) if gpu else odgi

    low = input_file.lower()

    # --- Stage 1: obtain an .og to work from -------------------------------
    if low.endswith(".og"):
        unsorted_og = input_file
    else:
        if low.endswith(".vg"):
            vg = _tool(os.environ.get("VG", "vg"), which)
            gfa_in = f"{pfx}.unsorted.gfa"
            runner([vg, "convert", "--no-wline", input_file, "-f"], stdout=gfa_in,
                   description="Convert VG to GFA (odgi cannot read W-lines)")
        elif low.endswith(".gz"):
            gfa_in = f"{pfx}.raw.gfa"
            runner(["gunzip", "-k", "-c", input_file], stdout=gfa_in,
                   description="Decompress GFA")
        elif low.endswith(".gfa"):
            gfa_in = input_file
        else:
            raise ValueError(
                f"Unrecognized input extension: {input_file} "
                f"(expected .vg, .gfa, .gfa.gz, or .og)")
        unsorted_og = f"{pfx}.unsorted.og"
        runner([odgi, "build", "-O", "-g", gfa_in, "-o", unsorted_og, "-P"],
               description="Build odgi graph (GFA -> OG)")

    # --- Stage 2: 1D sort (reference-guided) -------------------------------
    if sort:
        sorted_og = f"{pfx}.sorted.og"
        sort_cmd = [odgi, "sort", "-t", t, "--optimize", "-Y"]
        if paths:
            # Reproduce `odgi paths -L | grep <path>` for each priority, in order,
            # by listing once and filtering in Python (no shell pipe).
            listing = [ln for ln in capture([odgi, "paths", "-L", "-i", unsorted_og]).splitlines() if ln.strip()]
            ordered = []
            for p in paths:
                for ln in listing:
                    if p in ln and ln not in ordered:
                        ordered.append(ln)
            paths_txt = f"{pfx}.paths.txt"
            with open(paths_txt, "w") as f:
                f.write("\n".join(ordered))
                if ordered:
                    f.write("\n")
            sort_cmd += ["-H", paths_txt]
        sort_cmd += ["-i", unsorted_og, "-o", sorted_og, "-P"]
        runner(sort_cmd, description="Sort graph (1D, reference-guided)")
        layout_og = sorted_og
    else:
        layout_og = unsorted_og

    # --- Stage 3: 2D layout ------------------------------------------------
    layout_tsv = f"{pfx}.lay.tsv"
    layout_cmd = [odgi_layout, "layout", "-t", t, "-i", layout_og,
                  "--tsv", layout_tsv, "-o", f"{pfx}.lay", "-P"]
    if gpu:
        layout_cmd.append("--gpu")
    runner(layout_cmd, description="Compute 2D layout")

    # --- Stage 4: export the sorted GFA ------------------------------------
    # Named .sorted.gfa so it never clobbers a .gfa input sharing this prefix.
    sorted_gfa = f"{pfx}.sorted.gfa"
    runner([odgi, "view", "-t", t, "-i", layout_og, "-g"], stdout=sorted_gfa,
           description="Export sorted GFA")

    return sorted_gfa, layout_tsv
