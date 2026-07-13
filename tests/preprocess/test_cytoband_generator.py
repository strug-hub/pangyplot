"""
Tests for the pseudo-cytoband generator (`pangyplot cytoband`).

The load-bearing test is the round-trip: whatever we generate must be accepted
by the real parse_cytoband(), so the generator and parser cannot drift apart.
"""
import pytest

from pangyplot.preprocess import cytoband_generator
from pangyplot.preprocess.parser.parse_cytoband import parse_chromosome_list, parse_cytoband

KNOWN_STAINS = {"acen", "gneg", "gpos25", "gpos50", "gpos75", "gpos100", "gvar", "stalk"}


class TestParseLengths:
    def test_reads_fai(self, nonmodel_fai):
        lengths = cytoband_generator.parse_lengths(nonmodel_fai)
        assert lengths[0] == ("chr1", 12000000)
        assert len(lengths) == 5

    def test_accepts_two_column_tsv(self, tmp_path):
        f = tmp_path / "lengths.tsv"
        f.write_text("chrA\t1000\nchrB\t2000\n")
        assert cytoband_generator.parse_lengths(f) == [("chrA", 1000), ("chrB", 2000)]

    def test_skips_blank_and_comment_lines(self, tmp_path):
        f = tmp_path / "lengths.tsv"
        f.write_text("# a comment\n\nchrA\t1000\n")
        assert cytoband_generator.parse_lengths(f) == [("chrA", 1000)]

    def test_too_few_columns_raises(self, tmp_path):
        f = tmp_path / "bad.tsv"
        f.write_text("chrA\n")
        with pytest.raises(ValueError, match="at least 2 tab-separated"):
            cytoband_generator.parse_lengths(f)

    def test_non_integer_length_raises(self, tmp_path):
        f = tmp_path / "bad.tsv"
        f.write_text("chrA\tlots\n")
        with pytest.raises(ValueError, match="non-integer length"):
            cytoband_generator.parse_lengths(f)

    def test_duplicate_name_raises(self, tmp_path):
        f = tmp_path / "bad.tsv"
        f.write_text("chrA\t1000\nchrA\t2000\n")
        with pytest.raises(ValueError, match="duplicate sequence name"):
            cytoband_generator.parse_lengths(f)

    def test_empty_file_raises(self, tmp_path):
        f = tmp_path / "empty.tsv"
        f.write_text("")
        with pytest.raises(ValueError, match="No sequences found"):
            cytoband_generator.parse_lengths(f)


class TestSelectCanonical:
    def test_min_length_drops_scaffolds(self, nonmodel_fai):
        lengths = cytoband_generator.parse_lengths(nonmodel_fai)
        kept, dropped = cytoband_generator.select_canonical(lengths, min_length=1_000_000)
        assert [n for n, _ in kept] == ["chr1", "chr2", "chr3"]
        assert [n for n, _ in dropped] == ["scaffold_001", "scaffold_002"]

    def test_min_length_zero_keeps_everything(self, nonmodel_fai):
        lengths = cytoband_generator.parse_lengths(nonmodel_fai)
        kept, dropped = cytoband_generator.select_canonical(lengths, min_length=0)
        assert len(kept) == 5
        assert dropped == []

    def test_pattern_filters_by_name(self, nonmodel_fai):
        lengths = cytoband_generator.parse_lengths(nonmodel_fai)
        kept, _ = cytoband_generator.select_canonical(lengths, pattern=r"^chr")
        assert [n for n, _ in kept] == ["chr1", "chr2", "chr3"]

    def test_explicit_list_fixes_order(self, nonmodel_fai):
        lengths = cytoband_generator.parse_lengths(nonmodel_fai)
        kept, dropped = cytoband_generator.select_canonical(
            lengths, chromosomes=["chr3", "chr1"]
        )
        assert [n for n, _ in kept] == ["chr3", "chr1"]
        assert len(dropped) == 3

    def test_explicit_list_overrides_min_length(self, nonmodel_fai):
        lengths = cytoband_generator.parse_lengths(nonmodel_fai)
        kept, _ = cytoband_generator.select_canonical(
            lengths, min_length=1_000_000, chromosomes=["scaffold_002"]
        )
        assert [n for n, _ in kept] == ["scaffold_002"]

    def test_unknown_chromosome_raises(self, nonmodel_fai):
        lengths = cytoband_generator.parse_lengths(nonmodel_fai)
        with pytest.raises(ValueError, match="not present in the input"):
            cytoband_generator.select_canonical(lengths, chromosomes=["chrZ"])

    def test_filtering_everything_out_raises(self, nonmodel_fai):
        lengths = cytoband_generator.parse_lengths(nonmodel_fai)
        with pytest.raises(ValueError, match="no sequences survived"):
            cytoband_generator.select_canonical(lengths, min_length=10**12)


class TestGenerateBands:
    def test_default_is_one_solid_band(self):
        bands = cytoband_generator.generate_bands("chr1", 12_000_000)
        assert bands == [("chr1", 0, 12_000_000, "b1", "gneg")]

    def test_bands_tile_the_chromosome(self):
        bands = cytoband_generator.generate_bands("chr1", 12_000_000, band_size=5_000_000)
        assert [(b[1], b[2]) for b in bands] == [
            (0, 5_000_000), (5_000_000, 10_000_000), (10_000_000, 12_000_000)
        ]

    def test_stains_alternate(self):
        bands = cytoband_generator.generate_bands("chr1", 12_000_000, band_size=5_000_000)
        assert [b[4] for b in bands] == ["gneg", "gpos50", "gneg"]

    def test_never_emits_acen(self, nonmodel_fai):
        # Emitting a centromere would fabricate cytogenetic structure we do not have.
        lengths = cytoband_generator.parse_lengths(nonmodel_fai)
        for name, length in lengths:
            stains = {b[4] for b in cytoband_generator.generate_bands(name, length)}
            assert "acen" not in stains

    def test_short_chromosome_still_gets_one_band(self):
        bands = cytoband_generator.generate_bands("chrTiny", 500, band_size=5_000_000)
        assert len(bands) == 1
        assert (bands[0][1], bands[0][2]) == (0, 500)

    def test_num_bands_covers_whole_chromosome(self):
        bands = cytoband_generator.generate_bands("chr1", 12_000_000, num_bands=4)
        assert len(bands) == 4
        assert bands[0][1] == 0
        assert bands[-1][2] == 12_000_000

    def test_band_names_are_non_empty_and_unique(self):
        bands = cytoband_generator.generate_bands("chr1", 12_000_000, band_size=1_000_000)
        names = [b[3] for b in bands]
        assert all(names)
        assert len(set(names)) == len(names)

    def test_band_size_wins_when_both_given(self):
        bands = cytoband_generator.generate_bands(
            "chr1", 12_000_000, band_size=5_000_000, num_bands=99
        )
        assert len(bands) == 3

    def test_zero_num_bands_raises(self):
        with pytest.raises(ValueError, match="--num-bands"):
            cytoband_generator.generate_bands("chr1", 1000, num_bands=0)

    def test_zero_band_size_raises(self):
        with pytest.raises(ValueError, match="--band-size"):
            cytoband_generator.generate_bands("chr1", 1000, band_size=0)


class TestRoundTrip:
    """Generate with the real generator, then read back with the real parser."""

    @pytest.fixture
    def generated(self, nonmodel_fai, tmp_path):
        lengths = cytoband_generator.parse_lengths(nonmodel_fai)
        kept, _ = cytoband_generator.select_canonical(lengths, min_length=1_000_000)
        cytoband_path, canonical_path = cytoband_generator.write_cytoband(
            kept, str(tmp_path), "myOrg", band_size=5_000_000
        )
        return cytoband_path, canonical_path

    def test_parser_accepts_generated_files(self, generated):
        cytoband_path, canonical_path = generated

        chromosomes = parse_chromosome_list(canonical_path)
        assert chromosomes == ["chr1", "chr2", "chr3"]

        cytobands = parse_cytoband(cytoband_path, chromosomes)
        assert set(cytobands) == {"chr1", "chr2", "chr3"}

    def test_generated_bands_are_well_formed(self, generated):
        cytoband_path, canonical_path = generated
        cytobands = parse_cytoband(cytoband_path, parse_chromosome_list(canonical_path))

        for chrom, bands in cytobands.items():
            for band in bands:
                assert band["type"] in KNOWN_STAINS
                assert band["name"]
                assert isinstance(band["start"], int)
                assert isinstance(band["end"], int)
                assert band["start"] < band["end"]

    def test_bands_are_contiguous_from_zero(self, generated):
        cytoband_path, canonical_path = generated
        cytobands = parse_cytoband(cytoband_path, parse_chromosome_list(canonical_path))

        for bands in cytobands.values():
            assert bands[0]["start"] == 0
            for previous, current in zip(bands, bands[1:]):
                assert current["start"] == previous["end"]

    def test_chromosome_lengths_survive_the_round_trip(self, generated, nonmodel_fai):
        cytoband_path, canonical_path = generated
        cytobands = parse_cytoband(cytoband_path, parse_chromosome_list(canonical_path))

        source = dict(cytoband_generator.parse_lengths(nonmodel_fai))
        for chrom, bands in cytobands.items():
            assert max(b["end"] for b in bands) == source[chrom]

    def test_scaffolds_are_absent_from_both_files(self, generated):
        cytoband_path, canonical_path = generated
        assert "scaffold" not in open(canonical_path).read()
        assert "scaffold" not in open(cytoband_path).read()
