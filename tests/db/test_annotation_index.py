"""Tests for GFF3 parsing and AnnotationIndex using a synthetic DRB1-region fixture.

Fixture genes (chr6, bp range overlapping DRB1 step index 32578769–32589836):
  - HLA-DRB1: protein_coding, 2 transcripts (one MANE_Select), 3 exons each
  - TINY1: lncRNA, 1 transcript, 1 exon
  - FARAWAY: on chr1 (different chrom, excluded from chr6 range queries)
"""

import os
import shutil
import tempfile

import pytest

from pangyplot.preprocess.parser.parse_gff3 import parse_gff3, parse_line
from pangyplot.db.indexes.AnnotationIndex import AnnotationIndex
import pangyplot.db.sqlite.annotation_db as ann_db


@pytest.fixture(scope="module")
def annotation_dir(fixtures_dir):
    """Parse the GFF3 fixture into a temp dir with annotations.db."""
    tmpdir = tempfile.mkdtemp()
    gff3_path = str(fixtures_dir / "drb1_annotations.gff3")
    parse_gff3(gff3_path, tmpdir)
    yield tmpdir
    shutil.rmtree(tmpdir)


@pytest.fixture(scope="module")
def ann_index(annotation_dir):
    return AnnotationIndex("test", annotation_dir)


# ---------------------------------------------------------------------------
# GFF3 parsing
# ---------------------------------------------------------------------------

class TestParseGff3:

    def test_gene_count(self, annotation_dir):
        genes = ann_db.get_genes(annotation_dir)
        assert len(genes) == 3

    def test_gene_names(self, annotation_dir):
        genes = ann_db.get_genes(annotation_dir)
        assert set(genes) == {"HLA-DRB1", "TINY1", "FARAWAY"}

    def test_transcript_count(self, annotation_dir):
        conn = ann_db.get_connection(annotation_dir)
        count = conn.execute(
            "SELECT COUNT(*) FROM annotations WHERE type='transcript'"
        ).fetchone()[0]
        assert count == 4

    def test_exon_count(self, annotation_dir):
        conn = ann_db.get_connection(annotation_dir)
        count = conn.execute(
            "SELECT COUNT(*) FROM annotations WHERE type='exon'"
        ).fetchone()[0]
        assert count == 9

    def test_comment_lines_skipped(self):
        assert parse_line("##gff-version 3") is None
        assert parse_line("#description: test") is None

    def test_malformed_line_skipped(self):
        assert parse_line("too\tfew\tcolumns") is None


# ---------------------------------------------------------------------------
# AnnotationIndex lookups
# ---------------------------------------------------------------------------

class TestAnnotationIndex:

    def test_get_gene(self, ann_index):
        gene = ann_index["HLA-DRB1"]
        assert gene is not None
        assert gene.gene_name == "HLA-DRB1"

    def test_getitem_returns_gene_only(self, ann_index):
        """__getitem__ fetches with type='gene', so transcripts aren't linked."""
        gene = ann_index["HLA-DRB1"]
        assert gene.type == "gene"
        assert gene.transcripts == []

    def test_tiny_gene(self, ann_index):
        gene = ann_index["TINY1"]
        assert gene is not None
        assert gene.strand == "-"

    def test_nonexistent_gene(self, ann_index):
        assert ann_index["NONEXISTENT"] is None


# ---------------------------------------------------------------------------
# Range queries
# ---------------------------------------------------------------------------

class TestRangeQueries:

    def test_chr6_range_finds_drb1_and_tiny(self, ann_index):
        genes = ann_index.query_gene_range("chr6", 32578000, 32590000)
        names = {g.gene_name for g in genes}
        assert "HLA-DRB1" in names
        assert "TINY1" in names

    def test_range_query_builds_hierarchy(self, ann_index):
        genes = ann_index.query_gene_range("chr6", 32578000, 32590000)
        drb1 = next(g for g in genes if g.gene_name == "HLA-DRB1")
        assert len(drb1.transcripts) == 2
        for transcript in drb1.transcripts:
            assert len(transcript.exons) == 3

    def test_chr6_range_excludes_faraway(self, ann_index):
        genes = ann_index.query_gene_range("chr6", 32578000, 32590000)
        names = {g.gene_name for g in genes}
        assert "FARAWAY" not in names

    def test_mane_only(self, ann_index):
        genes = ann_index.query_gene_range(
            "chr6", 32578000, 32590000, mane_only=True)
        names = {g.gene_name for g in genes}
        assert "HLA-DRB1" in names
        assert "TINY1" not in names

    def test_narrow_range_excludes_tiny(self, ann_index):
        # TINY1 is at 32588000-32589500, query below that
        genes = ann_index.query_gene_range("chr6", 32578000, 32587500)
        names = {g.gene_name for g in genes}
        assert "HLA-DRB1" in names
        assert "TINY1" not in names


# ---------------------------------------------------------------------------
# Gene search
# ---------------------------------------------------------------------------

class TestGeneSearch:

    def test_search_drb(self, ann_index):
        results = ann_index.gene_search("DRB")
        names = {r.gene_name for r in results}
        assert "HLA-DRB1" in names

    def test_search_case_insensitive(self, ann_index):
        results = ann_index.gene_search("drb")
        names = {r.gene_name for r in results}
        assert "HLA-DRB1" in names

    def test_search_no_match(self, ann_index):
        results = ann_index.gene_search("zzzzz")
        assert len(results) == 0


# ---------------------------------------------------------------------------
# Transcript sorting (MANE_Select first)
# ---------------------------------------------------------------------------

class TestTranscriptSorting:

    def test_mane_transcript_first(self, ann_index):
        """sort_transcripts is called during serialize, which orders MANE first."""
        genes = ann_index.query_gene_range("chr6", 32578000, 32590000)
        drb1 = next(g for g in genes if g.gene_name == "HLA-DRB1")
        drb1.sort_transcripts()
        assert drb1.transcripts[0].mane_select is True

    def test_non_mane_transcript_second(self, ann_index):
        genes = ann_index.query_gene_range("chr6", 32578000, 32590000)
        drb1 = next(g for g in genes if g.gene_name == "HLA-DRB1")
        drb1.sort_transcripts()
        assert drb1.transcripts[1].mane_select is False
