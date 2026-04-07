"""Shared fixtures for db index tests, built from the DRB1-3123 fixture."""

import shutil
import tempfile

import pytest

from pangyplot.preprocess.parser.parse_gfa import parse_gfa
from pangyplot.preprocess.parser.parse_layout import parse_layout
import pangyplot.preprocess.bubble.bubble_gun as bubble_gun
from pangyplot.db.indexes.GFAIndex import GFAIndex
from pangyplot.db.indexes.StepIndex import StepIndex
from pangyplot.db.indexes.BubbleIndex import BubbleIndex

REFERENCE = "gi|568815592"


@pytest.fixture(scope="module")
def drb1_dir(fixtures_dir):
    """Run the full DRB1 pipeline once per module and yield the temp directory."""
    tmpdir = tempfile.mkdtemp()

    gfa_path = str(fixtures_dir / "DRB1-3123.gfa")
    layout_path = str(fixtures_dir / "DRB1-3123.lay.tsv")
    layout_coords = parse_layout(layout_path)

    parse_gfa(
        gfa_file=gfa_path, ref=REFERENCE, path=None,
        ref_offset=0, path_sep=None,
        layout_coords=layout_coords, dir=tmpdir,
    )
    bubble_gun.shoot(
        GFAIndex(tmpdir).segment_index,
        GFAIndex(tmpdir).link_index,
        tmpdir, REFERENCE,
    )

    yield tmpdir
    shutil.rmtree(tmpdir)


@pytest.fixture(scope="module")
def drb1_segment_index(drb1_dir):
    return GFAIndex(drb1_dir).segment_index


@pytest.fixture(scope="module")
def drb1_link_index(drb1_dir):
    return GFAIndex(drb1_dir).link_index


@pytest.fixture(scope="module")
def drb1_gfa_index(drb1_dir):
    return GFAIndex(drb1_dir)


@pytest.fixture(scope="module")
def drb1_step_index(drb1_dir):
    return StepIndex(drb1_dir, REFERENCE)


@pytest.fixture(scope="module")
def drb1_bubble_index(drb1_dir):
    gfa_index = GFAIndex(drb1_dir)
    return BubbleIndex(drb1_dir, gfa_index)
