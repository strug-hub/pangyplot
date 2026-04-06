"""
Unit tests for cytoband parsing and organism data file mappings.
Fixtures in tests/fixtures/cytoband/.
"""
import os
import math
import pytest
from pangyplot.preprocess.parser.parse_cytoband import parse_chromosome_list, parse_cytoband
import pangyplot.organisms as organisms


class TestParseChromosomeList:
    def test_basic(self, canonical_file):
        assert parse_chromosome_list(canonical_file) == ["chr1", "chr2"]

    def test_empty_file(self, tmp_path):
        f = tmp_path / "empty.txt"
        f.write_text("")
        assert parse_chromosome_list(f) == []


class TestParseCytobandStructure:
    def test_band_counts(self, cytoband_file, canonical_file):
        chroms = parse_chromosome_list(canonical_file)
        result = parse_cytoband(cytoband_file, chroms)
        assert set(result.keys()) == {"chr1", "chr2"}
        assert len(result["chr1"]) == 3
        assert len(result["chr2"]) == 6

    def test_band_fields(self, cytoband_file, canonical_file):
        chroms = parse_chromosome_list(canonical_file)
        band = parse_cytoband(cytoband_file, chroms)["chr1"][0]
        assert band["band"] == 0
        assert band["start"] == 0
        assert band["end"] == 2300000
        assert band["name"] == "p36.33"
        assert band["type"] == "gneg"
        assert band["chr"] == "chr1"


class TestParseCytobandColors:
    def test_known_band_types(self, cytoband_file, canonical_file):
        color_map = {
            "acen": "#CC0000", "gneg": "#FFFFFF", "gpos100": "#000000",
            "gpos25": "#CCCCCC", "gpos50": "#7F7F7F", "gpos75": "#333333",
            "gvar": "#0DCC00", "stalk": "#00CC83",
        }
        chroms = parse_chromosome_list(canonical_file)
        result = parse_cytoband(cytoband_file, chroms)
        for bands in result.values():
            for band in bands:
                assert band["color"] == color_map[band["type"]]

    def test_unknown_band_type_gets_default(self, tmp_path):
        f = tmp_path / "unknown.txt"
        f.write_text("chr1\t0\t1000\tp1\tnotatype\n")
        assert parse_cytoband(f)["chr1"][0]["color"] == "#000000"


class TestParseCytobandNormalization:
    def test_sizes_sum_to_one(self, cytoband_file, canonical_file):
        chroms = parse_chromosome_list(canonical_file)
        result = parse_cytoband(cytoband_file, chroms)
        for bands in result.values():
            assert math.isclose(sum(b["size"] for b in bands), 1.0)

    def test_x_equals_cumulative_size(self, cytoband_file, canonical_file):
        chroms = parse_chromosome_list(canonical_file)
        result = parse_cytoband(cytoband_file, chroms)
        for bands in result.values():
            cumulative = 0.0
            for band in bands:
                assert math.isclose(band["x"], cumulative, abs_tol=1e-12)
                cumulative += band["size"]


class TestParseCytobandFiltering:
    def test_no_filter_returns_all(self, cytoband_file):
        assert set(parse_cytoband(cytoband_file).keys()) == {"chr1", "chr2"}

    def test_filter_to_one_chrom(self, cytoband_file):
        assert set(parse_cytoband(cytoband_file, ["chr1"]).keys()) == {"chr1"}


class TestParseCytobandEdgeCases:
    def test_empty_name_falls_back_to_chrom(self, empty_name_file):
        result = parse_cytoband(empty_name_file)
        assert result["chr1"][0]["name"] == "chr1"
        assert result["chr1"][1]["name"] == "p36.32"


class TestParseCytobandValidation:
    def test_empty_file_raises(self, tmp_path):
        f = tmp_path / "empty.txt"
        f.write_text("")
        with pytest.raises(ValueError, match="No cytoband data"):
            parse_cytoband(f)

    def test_wrong_column_count_raises(self, tmp_path):
        f = tmp_path / "bad.txt"
        f.write_text("chr1\t0\t1000\n")
        with pytest.raises(ValueError, match="expected 5 tab-separated columns"):
            parse_cytoband(f)

    def test_non_integer_coords_raises(self, tmp_path):
        f = tmp_path / "bad.txt"
        f.write_text("chr1\tabc\t1000\tp1\tgneg\n")
        with pytest.raises(ValueError, match="non-integer coordinates"):
            parse_cytoband(f)


CYTOBAND_DIR = os.path.join(
    os.path.dirname(os.path.realpath(organisms.__file__)),
    "static", "cytoband",
)


class TestOrganismMappings:
    def test_all_genomes_have_data_files(self):
        for org, genome in organisms.ORGANISM_TO_GENOME.items():
            cytoband = os.path.join(CYTOBAND_DIR, f"{genome}.cytoBand.txt")
            canonical = os.path.join(CYTOBAND_DIR, f"{genome}.canonical.txt")
            assert os.path.isfile(cytoband), f"{org}: missing {cytoband}"
            assert os.path.isfile(canonical), f"{org}: missing {canonical}"
