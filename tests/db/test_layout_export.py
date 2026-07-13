"""Layout export tests against the bundled chrY datastore.

Covers the coupling that makes the export usable: the GFA and the layout must
describe the same segments under the same compacted IDs, in the same order.
"""

import json
import os
import shutil
import struct
import subprocess

import pytest

from pangyplot.db.indexes.GFAIndex import GFAIndex
from pangyplot.db.indexes.BubbleIndex import BubbleIndex
from pangyplot.db.indexes.StepIndex import StepIndex
from pangyplot.utils import layout_writer
import pangyplot.db.query as query


DATASTORE = os.path.join(os.path.dirname(__file__), "..", "..", "datastore")
CHR_DIR = os.path.join(DATASTORE, "graphs", "hprc.clip", "chrY")
GENOME = "GRCh38"
CHROM = "chrY"
START = 23128355
END = 23200010

ODGI = shutil.which("odgi") or "/home/scott/bin/odgi"


@pytest.fixture(scope="module")
def indexes():
    if not os.path.isdir(CHR_DIR):
        pytest.skip(f"chrY datastore not found at {CHR_DIR}")

    class Indexes:
        pass

    idx = Indexes()
    gfaidx = GFAIndex(CHR_DIR)
    idx.gfa_index = {CHROM: gfaidx}
    idx.step_index = {(CHROM, GENOME): StepIndex(CHR_DIR, GENOME)}
    idx.bubble_index = {CHROM: BubbleIndex(CHR_DIR, gfaidx)}
    return idx


@pytest.fixture(scope="module")
def bubble_ids(indexes):
    response = query.get_bubble_graph(indexes, GENOME, CHROM, START, END)
    ids = [int(n["id"][1:]) for n in response["nodes"] if n["id"].startswith("b")]
    assert ids, "region produced no bubbles"
    return ids[:20]


@pytest.fixture(scope="module")
def subgraph(indexes, bubble_ids):
    return query.resolve_export_subgraph(indexes, GENOME, CHROM, bubble_ids)


@pytest.fixture(scope="module")
def gfa_text(indexes, bubble_ids, subgraph):
    """The compacted GFA, as shipped in the layout archive."""
    return "".join(query.generate_gfa(indexes, GENOME, CHROM, bubble_ids,
                                      subgraph=subgraph, compact=True))


@pytest.fixture(scope="module")
def raw_gfa_text(indexes, bubble_ids, subgraph):
    """The plain GFA export, which keeps the source graph's IDs."""
    return "".join(query.generate_gfa(indexes, GENOME, CHROM, bubble_ids,
                                      subgraph=subgraph))


def _s_lines(gfa_text):
    return [line.split("\t") for line in gfa_text.splitlines() if line.startswith("S")]


class TestPlainGfaKeepsSourceIds:
    """The plain GFA export is unchanged: source IDs, no compaction, no tag."""

    def test_segment_ids_are_the_source_ids(self, raw_gfa_text, subgraph):
        ids = [int(f[1]) for f in _s_lines(raw_gfa_text)]

        assert sorted(ids) == sorted(subgraph["ordered_ids"])

    def test_no_original_id_tag_is_added(self, raw_gfa_text):
        for fields in _s_lines(raw_gfa_text):
            assert len(fields) == 3

    def test_links_use_source_ids(self, raw_gfa_text, subgraph):
        valid = set(subgraph["ordered_ids"])

        links = [line.split("\t") for line in raw_gfa_text.splitlines()
                 if line.startswith("L")]
        assert links
        for fields in links:
            assert int(fields[1]) in valid
            assert int(fields[3]) in valid


class TestIdCompaction:
    """odgi rejects non-compacted IDs, so the layout archive must renumber to 1..N."""

    def test_segment_ids_are_compacted_to_one_based_range(self, gfa_text, subgraph):
        ids = [int(f[1]) for f in _s_lines(gfa_text)]

        assert sorted(ids) == list(range(1, len(subgraph["ordered_ids"]) + 1))

    def test_original_id_is_preserved_as_a_tag(self, gfa_text, subgraph):
        id_map = subgraph["id_map"]

        for fields in _s_lines(gfa_text):
            original = int(fields[3].split(":")[-1])
            assert id_map[original] == int(fields[1])

    def test_links_use_compacted_ids(self, gfa_text, subgraph):
        n = len(subgraph["ordered_ids"])

        links = [line.split("\t") for line in gfa_text.splitlines() if line.startswith("L")]
        assert links
        for fields in links:
            assert 1 <= int(fields[1]) <= n
            assert 1 <= int(fields[3]) <= n

    def test_paths_use_compacted_ids(self, gfa_text, subgraph):
        n = len(subgraph["ordered_ids"])

        paths = [line.split("\t") for line in gfa_text.splitlines() if line.startswith("P")]
        assert paths
        for fields in paths:
            for step in fields[2].split(","):
                assert 1 <= int(step[:-1]) <= n


class TestLayoutMatchesGfa:

    def test_bandage_covers_exactly_the_exported_segments(self, indexes, bubble_ids, subgraph):
        _, bandage, _ = query.generate_layout(indexes, GENOME, CHROM, bubble_ids,
                                              subgraph=subgraph)

        keys = {int(k.rstrip("+")) for k in json.loads(bandage)}
        assert keys == set(range(1, len(subgraph["ordered_ids"]) + 1))

    def test_coordinates_come_from_the_stored_odgi_layout(self, indexes, bubble_ids, subgraph):
        _, bandage, _ = query.generate_layout(indexes, GENOME, CHROM, bubble_ids,
                                              subgraph=subgraph)
        data = json.loads(bandage)

        by_id = {seg.id: seg for seg in subgraph["segments"]}
        for original, compacted in subgraph["id_map"].items():
            seg = by_id[original]
            points = data[f"{compacted}+"]
            assert points[0] == pytest.approx([seg.x1, seg.y1])
            assert points[-1] == pytest.approx([seg.x2, seg.y2])

    def test_lay_holds_two_handles_per_segment(self, indexes, bubble_ids, subgraph):
        lay, _, _ = query.generate_layout(indexes, GENOME, CHROM, bubble_ids,
                                          subgraph=subgraph)

        # enc_vector element count follows the 8-byte min_value.
        n_values = struct.unpack_from("<Q", lay, 8)[0]
        assert n_values == 4 * len(subgraph["ordered_ids"])  # 2 handles * (x, y)

    def test_empty_selection_exports_nothing(self, indexes):
        lay, bandage, stats = query.generate_layout(indexes, GENOME, CHROM, [])

        assert stats["segments"] == 0
        assert json.loads(bandage) == {}


class TestRefinedGeometry:
    """The viewer's refined positions, and the fill for what it cannot supply."""

    def test_refined_polylines_override_the_stored_layout(self, indexes, bubble_ids, subgraph):
        target = subgraph["ordered_ids"][0]
        compacted = subgraph["id_map"][target]

        _, bandage, stats = query.generate_layout(
            indexes, GENOME, CHROM, bubble_ids, subgraph=subgraph,
            polylines={str(target): [[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]]},
        )
        data = json.loads(bandage)

        assert data[f"{compacted}+"] == [[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]]
        assert stats["filled"] == len(subgraph["ordered_ids"]) - 1

    def test_segments_the_viewer_cannot_place_are_filled(self, indexes, bubble_ids, subgraph):
        # Only two segments are refined; every other segment is hidden inside an
        # unpopped bubble and must still receive a position.
        first, second = subgraph["ordered_ids"][:2]

        _, bandage, stats = query.generate_layout(
            indexes, GENOME, CHROM, bubble_ids, subgraph=subgraph,
            polylines={
                str(first): [[0.0, 0.0], [10.0, 0.0]],
                str(second): [[10.0, 0.0], [20.0, 0.0]],
            },
        )
        data = json.loads(bandage)

        assert len(data) == len(subgraph["ordered_ids"])
        assert stats["filled"] == len(subgraph["ordered_ids"]) - 2
        assert all(len(points) >= 2 for points in data.values())

    def test_polylines_accept_the_viewer_s_s_prefixed_ids(self, indexes, bubble_ids, subgraph):
        target = subgraph["ordered_ids"][0]
        compacted = subgraph["id_map"][target]

        _, bandage, _ = query.generate_layout(
            indexes, GENOME, CHROM, bubble_ids, subgraph=subgraph,
            polylines={f"s{target}": [[7.0, 8.0], [9.0, 10.0]]},
        )

        assert json.loads(bandage)[f"{compacted}+"] == [[7.0, 8.0], [9.0, 10.0]]


class TestSimilarityFit:

    def test_recovers_a_known_transform(self):
        source = [(0.0, 0.0), (1.0, 0.0), (0.0, 1.0), (2.0, 3.0)]
        # scale 2, rotate 90 degrees, translate (5, -1)
        target = [(5.0, -1.0), (5.0, 1.0), (3.0, -1.0), (-1.0, 3.0)]

        transform = layout_writer.fit_similarity(source, target)

        for src, expected in zip(source, target):
            assert layout_writer.apply_similarity(transform, src) == pytest.approx(expected)

    def test_identity_when_there_is_nothing_to_fit(self):
        transform = layout_writer.fit_similarity([(1.0, 2.0)], [(9.0, 9.0)])

        assert layout_writer.apply_similarity(transform, (1.0, 2.0)) == (1.0, 2.0)


@pytest.mark.skipif(not shutil.which(ODGI), reason="odgi binary not available")
def test_export_renders_through_odgi_draw(indexes, bubble_ids, subgraph, gfa_text, tmp_path):
    """The promise to the reviewer: the exported pair actually runs through odgi draw."""
    lay, _, _ = query.generate_layout(indexes, GENOME, CHROM, bubble_ids, subgraph=subgraph)

    gfa = tmp_path / "export.gfa"
    gfa.write_text(gfa_text)
    (tmp_path / "export.lay").write_bytes(lay)

    og = tmp_path / "export.og"
    subprocess.run([ODGI, "build", "-g", str(gfa), "-o", str(og)],
                   check=True, capture_output=True)
    png = tmp_path / "export.png"
    subprocess.run([ODGI, "draw", "-i", str(og), "-c", str(tmp_path / "export.lay"),
                    "-p", str(png)], check=True, capture_output=True)

    assert png.stat().st_size > 0
