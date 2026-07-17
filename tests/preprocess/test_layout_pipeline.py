"""Unit tests for the vg/odgi executor behind `pangyplot preprocess --run`.

The external tools are never invoked here: `which`, `runner`, and `capture` are
injected so the tests assert on the *command sequence* the pipeline would run.
"""
import os

import pytest

from pangyplot.preprocess import layout_pipeline as lp


class Recorder:
    """Fake runner/capture pair that records argv instead of executing."""
    def __init__(self, listing=""):
        self.calls = []          # list of (argv, stdout)
        self.listing = listing

    def run(self, argv, stdout=None, description=None):
        self.calls.append((argv, stdout))

    def capture(self, argv):
        self.calls.append((argv, "<capture>"))
        return self.listing

    def argvs(self):
        return [argv for argv, _ in self.calls]

    def tool_of(self, subcommand):
        """First recorded call whose second token == subcommand (e.g. 'build')."""
        for argv, _ in self.calls:
            if len(argv) > 1 and argv[1] == subcommand:
                return argv
        return None


def _which_all(path_prefix="/usr/bin/"):
    return lambda name: f"{path_prefix}{name}"


def test_gfa_input_skips_vg_convert(tmp_path):
    rec = Recorder()
    gfa, tsv = lp.run_layout_pipeline(
        input_file="/data/chrY.gfa", output_dir=str(tmp_path), prefix="chrY",
        paths=[], sort=True, which=_which_all(), runner=rec.run, capture=rec.capture)

    verbs = [argv[1] for argv, _ in rec.calls]
    assert "convert" not in verbs          # no vg step for a GFA input
    assert verbs == ["build", "sort", "layout", "view"]
    assert gfa == str(tmp_path / "chrY.sorted.gfa")
    assert tsv == str(tmp_path / "chrY.lay.tsv")


def test_vg_input_prepends_convert(tmp_path):
    rec = Recorder()
    lp.run_layout_pipeline(
        input_file="/data/chrY.vg", output_dir=str(tmp_path), prefix="chrY",
        sort=True, which=_which_all(), runner=rec.run, capture=rec.capture)

    convert = rec.tool_of("convert")
    assert convert is not None
    assert convert[0].endswith("vg")
    assert "--no-wline" in convert
    # build must consume the converted GFA, written next to the outputs.
    build = rec.tool_of("build")
    assert str(tmp_path / "chrY.unsorted.gfa") in build


def test_og_input_skips_build(tmp_path):
    rec = Recorder()
    lp.run_layout_pipeline(
        input_file="/data/chrY.og", output_dir=str(tmp_path), prefix="chrY",
        sort=True, which=_which_all(), runner=rec.run, capture=rec.capture)
    verbs = [argv[1] for argv, _ in rec.calls]
    assert "build" not in verbs
    # sort reads the .og input directly
    assert "/data/chrY.og" in rec.tool_of("sort")


def test_no_sort_layout_uses_unsorted(tmp_path):
    rec = Recorder()
    lp.run_layout_pipeline(
        input_file="/data/chrY.gfa", output_dir=str(tmp_path), prefix="chrY",
        sort=False, which=_which_all(), runner=rec.run, capture=rec.capture)
    verbs = [argv[1] for argv, _ in rec.calls]
    assert "sort" not in verbs
    layout = rec.tool_of("layout")
    assert str(tmp_path / "chrY.unsorted.og") in layout


def test_gpu_uses_odgi_gpu_for_layout_only(tmp_path):
    rec = Recorder()
    lp.run_layout_pipeline(
        input_file="/data/chrY.gfa", output_dir=str(tmp_path), prefix="chrY",
        gpu=True, sort=True, which=_which_all(), runner=rec.run, capture=rec.capture)
    layout = rec.tool_of("layout")
    assert layout[0].endswith("odgi_gpu")
    assert "--gpu" in layout
    # build/sort/view stay on the CPU odgi
    assert rec.tool_of("build")[0].endswith("/odgi")
    assert rec.tool_of("view")[0].endswith("/odgi")


def test_paths_written_in_order_and_deduped(tmp_path):
    listing = "GRCh38#chrY\nCHM13#chrY\nHG002#1#chrY\nGRCh38#chrY_alt\n"
    rec = Recorder(listing=listing)
    lp.run_layout_pipeline(
        input_file="/data/chrY.gfa", output_dir=str(tmp_path), prefix="chrY",
        paths=["GRCh38", "CHM13"], sort=True,
        which=_which_all(), runner=rec.run, capture=rec.capture)

    paths_txt = tmp_path / "chrY.paths.txt"
    assert paths_txt.exists()
    lines = paths_txt.read_text().split()
    # both GRCh38 lines first (in listing order), then the CHM13 line; no dupes
    assert lines == ["GRCh38#chrY", "GRCh38#chrY_alt", "CHM13#chrY"]
    assert "-H" in rec.tool_of("sort")


def test_missing_odgi_raises_toolmissing(tmp_path):
    with pytest.raises(lp.ToolMissing) as exc:
        lp.run_layout_pipeline(
            input_file="/data/chrY.gfa", output_dir=str(tmp_path), prefix="chrY",
            which=lambda name: None, runner=lambda *a, **k: None,
            capture=lambda a: "")
    assert exc.value.name == "odgi"


def test_missing_vg_raises_only_for_vg_input(tmp_path):
    # odgi present, vg absent: a GFA input is fine, a VG input fails on vg.
    which = lambda name: None if name == "vg" else f"/usr/bin/{name}"
    rec = Recorder()
    lp.run_layout_pipeline(
        input_file="/data/chrY.gfa", output_dir=str(tmp_path), prefix="chrY",
        which=which, runner=rec.run, capture=rec.capture)  # no raise

    with pytest.raises(lp.ToolMissing) as exc:
        lp.run_layout_pipeline(
            input_file="/data/chrY.vg", output_dir=str(tmp_path), prefix="chrY",
            which=which, runner=rec.run, capture=rec.capture)
    assert exc.value.name == "vg"


def test_unrecognized_extension_raises(tmp_path):
    with pytest.raises(ValueError):
        lp.run_layout_pipeline(
            input_file="/data/chrY.txt", output_dir=str(tmp_path), prefix="chrY",
            which=_which_all(), runner=lambda *a, **k: None, capture=lambda a: "")


def test_prefix_defaults_from_input_basename(tmp_path):
    rec = Recorder()
    gfa, tsv = lp.run_layout_pipeline(
        input_file="/data/chrY.gfa", output_dir=str(tmp_path),
        which=_which_all(), runner=rec.run, capture=rec.capture)
    assert os.path.basename(gfa) == "chrY.sorted.gfa"
    assert os.path.basename(tsv) == "chrY.lay.tsv"
