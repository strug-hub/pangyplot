"""
Tests for pangyplot/preprocess/parser/gfa/parse_utils.py

parse_id_string() is called on every P/W-line path name. It must correctly
extract genome, haplotype, contig, and start offset from all naming conventions
found in real GFA files.
"""
import pytest
from pangyplot.preprocess.parser.gfa.parse_utils import parse_id_string, pound_separated


class TestParsePoundSeparated:
    def test_two_part_genome_contig(self):
        # CHM13#chr7 → genome=CHM13, contig=chr7, no haplotype
        result = pound_separated("CHM13#chr7")
        assert result["genome"] == "CHM13"
        assert result["contig"] == "chr7"
        assert result["hap"] is None
        assert result["start"] == 0

    def test_three_part_with_haplotype(self):
        # GRCh38#0#chr5 → genome=GRCh38, hap=0, contig=chr5
        result = pound_separated("GRCh38#0#chr5")
        assert result["genome"] == "GRCh38"
        assert result["hap"] == "0"
        assert result["contig"] == "chr5"
        assert result["start"] == 0

    def test_bracket_coordinate_suffix(self):
        # GRCh38#0#chr5[10000-626046] → start offset extracted from brackets
        result = pound_separated("GRCh38#0#chr5[10000-626046]")
        assert result["genome"] == "GRCh38"
        assert result["hap"] == "0"
        assert result["contig"] == "chr5"
        assert result["start"] == 10000

    def test_bracket_coords_stripped_from_contig(self):
        result = pound_separated("GRCh38#0#chr5[10000-626046]")
        assert "[" not in result["contig"]

    def test_bracket_offset_accumulates_with_passed_start(self):
        # If a start is already provided AND brackets are present, they add together
        result = pound_separated("GRCh38#0#chr5[500-1000]", start=100)
        assert result["start"] == 600


class TestParseIdString:
    def test_simple_hash_two_parts(self):
        result = parse_id_string("CHM13#chr7")
        assert result["genome"] == "CHM13"
        assert result["contig"] == "chr7"
        assert result["hap"] is None
        assert result["start"] == 0

    def test_hash_three_parts_with_haplotype(self):
        result = parse_id_string("GRCh38#0#chr5")
        assert result["genome"] == "GRCh38"
        assert result["hap"] == "0"
        assert result["contig"] == "chr5"
        assert result["start"] == 0

    def test_hash_with_bracket_coordinates(self):
        result = parse_id_string("GRCh38#0#chr5[10000-626046]")
        assert result["start"] == 10000
        assert result["contig"] == "chr5"

    def test_bare_name_no_separators(self):
        # A plain name with no # or : — genome and contig both set to the full string
        result = parse_id_string("GRCh38")
        assert result["genome"] == "GRCh38"
        assert result["contig"] == "GRCh38"
        assert result["hap"] is None
        assert result["start"] == 0

    def test_pipe_style_with_colon_coordinates(self):
        # gi|568815592:32578768-32589835 — the :start-end suffix is stripped,
        # and the remainder becomes both genome and contig
        result = parse_id_string("gi|568815592:32578768-32589835")
        assert result["start"] == 32578768
        assert result["genome"] == "gi|568815592"
        assert result["contig"] == "gi|568815592"

    def test_colon_coord_suffix_stripped_before_hash_parse(self):
        # Hash name with a :start-end suffix (e.g. from clipped regions)
        result = parse_id_string("GRCh38#0#chr5:1000-2000")
        assert result["start"] == 1000
        assert result["genome"] == "GRCh38"
        assert result["hap"] == "0"
        assert result["contig"] == "chr5"

    def test_start_defaults_to_zero(self):
        result = parse_id_string("HG001#1#chr1")
        assert result["start"] == 0
