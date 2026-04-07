"""
Tests for individual GFA line parsers:
  - parse_segments.parse_line_S
  - parse_links.parse_line_L
  - parse_paths.parse_line_P, parse_line_W, path_from_W

"""
import pytest
from pangyplot.preprocess.parser.gfa.parse_segments import parse_line_S
from pangyplot.preprocess.parser.gfa.parse_links import parse_line_L
from pangyplot.preprocess.parser.gfa.parse_paths import (
    parse_line_P,
    parse_line_W,
    path_from_W,
)


# ---------------------------------------------------------------------------
# S-line parser
# ---------------------------------------------------------------------------

class TestParseLineS:
    def test_segment_id(self):
        seg = parse_line_S("S\t42\tACGT\n")
        assert seg.id == 42

    def test_sequence_stored(self):
        seg = parse_line_S("S\t1\tACGT\n")
        assert seg.seq == "ACGT"

    def test_length(self):
        seg = parse_line_S("S\t1\tACGTACGT\n")
        assert seg.length == 8

    def test_lowercase_input_uppercased(self):
        seg = parse_line_S("S\t1\tacgt\n")
        assert seg.seq == "ACGT"

    def test_gc_count(self):
        # GCGCAA → 4 G/C bases
        seg = parse_line_S("S\t1\tGCGCAA\n")
        assert seg.gc_count == 4

    def test_gc_count_zero_for_at_only(self):
        seg = parse_line_S("S\t1\tATATAT\n")
        assert seg.gc_count == 0

    def test_n_count(self):
        seg = parse_line_S("S\t1\tACGNNA\n")
        assert seg.n_count == 2

    def test_n_count_zero_when_no_n(self):
        seg = parse_line_S("S\t1\tACGT\n")
        assert seg.n_count == 0


# ---------------------------------------------------------------------------
# L-line parser
# ---------------------------------------------------------------------------

class TestParseLineL:
    def test_from_id(self):
        link = parse_line_L("L\t1\t+\t2\t+\t0M\n")
        assert link.from_id == 1

    def test_to_id(self):
        link = parse_line_L("L\t1\t+\t2\t+\t0M\n")
        assert link.to_id == 2

    def test_forward_strands(self):
        link = parse_line_L("L\t1\t+\t2\t+\t0M\n")
        assert link.from_strand == "+"
        assert link.to_strand == "+"

    def test_reverse_strand(self):
        link = parse_line_L("L\t1\t+\t2\t-\t0M\n")
        assert link.to_strand == "-"

    def test_both_reverse(self):
        link = parse_line_L("L\t5\t-\t6\t-\t0M\n")
        assert link.from_strand == "-"
        assert link.to_strand == "-"


# ---------------------------------------------------------------------------
# P-line parser
# ---------------------------------------------------------------------------

class TestParseLineP:
    def test_full_id_stored(self):
        path = parse_line_P("P\tGRCh38#0#chr1\t1+,2+,4+\t*,*\n")
        assert path.full_id == "GRCh38#0#chr1"

    def test_sample_extracted_from_hash_name(self):
        path = parse_line_P("P\tGRCh38#0#chr1\t1+,2+,4+\t*,*\n")
        assert path.sample == "GRCh38"

    def test_haplotype_extracted(self):
        path = parse_line_P("P\tGRCh38#0#chr1\t1+,2+,4+\t*,*\n")
        assert path.hap == "0"

    def test_contig_extracted(self):
        path = parse_line_P("P\tGRCh38#0#chr1\t1+,2+,4+\t*,*\n")
        assert path.contig == "chr1"

    def test_path_steps_parsed(self):
        path = parse_line_P("P\tGRCh38#0#chr1\t1+,2+,4+\t*,*\n")
        assert path.path == ["1+", "2+", "4+"]

    def test_path_sep_splits_sample_name(self):
        # path_sep='.' means sample is taken as the prefix before the first '.'
        path = parse_line_P("P\tNA19240.1#chr1\t1+,2+\t*\n", path_sep=".")
        assert path.sample == "NA19240"

    def test_two_part_hash_no_haplotype(self):
        path = parse_line_P("P\tCHM13#chr7\t1+,2+\t*\n")
        assert path.sample == "CHM13"
        assert path.hap is None
        assert path.contig == "chr7"


# ---------------------------------------------------------------------------
# W-line parser
# ---------------------------------------------------------------------------

class TestParseLineW:
    def test_sample_stored(self):
        path = parse_line_W("W\tGRCh38\t0\tchr1\t0\t16\t>1001>1002>1004>1005\n")
        assert path.sample == "GRCh38"

    def test_haplotype_stored(self):
        path = parse_line_W("W\tGRCh38\t0\tchr1\t0\t16\t>1001>1002>1004>1005\n")
        assert path.hap == "0"

    def test_contig_stored(self):
        path = parse_line_W("W\tGRCh38\t0\tchr1\t0\t16\t>1001>1002>1004>1005\n")
        assert path.contig == "chr1"

    def test_path_sep_applied_to_sample(self):
        path = parse_line_W("W\tNA19240.1\t0\tchr1\t0\t16\t>1001>1002\n", path_sep=".")
        assert path.sample == "NA19240"

    def test_full_id_is_sample_name(self):
        path = parse_line_W("W\tGRCh38\t0\tchr1\t0\t16\t>1001>1002\n")
        assert path.full_id == "GRCh38"


# ---------------------------------------------------------------------------
# path_from_W — walk string parser
# ---------------------------------------------------------------------------

class TestPathFromW:
    def test_single_forward_segment(self):
        assert path_from_W(">1001") == ["+1001"]

    def test_single_reverse_segment(self):
        assert path_from_W("<1001") == ["-1001"]

    def test_all_forward(self):
        assert path_from_W(">1001>1002>1003") == ["+1001", "+1002", "+1003"]

    def test_all_reverse(self):
        assert path_from_W("<1001<1002<1003") == ["-1001", "-1002", "-1003"]

    def test_mixed_orientations(self):
        assert path_from_W(">1001<1002>1003") == ["+1001", "-1002", "+1003"]

    def test_starts_with_reverse_then_forward(self):
        assert path_from_W("<1001>1002>1003") == ["-1001", "+1002", "+1003"]

    def test_two_segments_forward(self):
        assert path_from_W(">1001>1002") == ["+1001", "+1002"]

    def test_two_segments_reverse_then_forward(self):
        assert path_from_W("<1001>1002") == ["-1001", "+1002"]

    def test_four_segments_realistic(self):
        assert path_from_W(">1001>1002>1004>1005") == ["+1001", "+1002", "+1004", "+1005"]

    def test_mixed_four_segments(self):
        assert path_from_W(">1001<1002>1003<1004") == ["+1001", "-1002", "+1003", "-1004"]
