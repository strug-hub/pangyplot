"""Tests for parse_gff3.parse_line() — GFF3 line parsing and attribute extraction."""

from pangyplot.preprocess.parser.parse_gff3 import parse_line


def _gene_line(chrom="chr6", start=32579000, end=32587000, strand="+",
               gene_name="HLA-DRB1", gene_id="ENSG00000196126.1"):
    return (f"{chrom}\tHAVANA\tgene\t{start}\t{end}\t.\t{strand}\t.\t"
            f"ID={gene_id};gene_id={gene_id};gene_type=protein_coding;gene_name={gene_name}")


def _transcript_line(tag="basic", parent="ENSG00000196126.1",
                     transcript_id="ENST00000360004.1"):
    return (f"chr6\tHAVANA\ttranscript\t32579000\t32587000\t.\t+\t.\t"
            f"ID={transcript_id};Parent={parent};gene_name=HLA-DRB1;"
            f"transcript_type=protein_coding;tag={tag}")


def _exon_line(exon_id="exon:ENST00000360004.1:3", exon_number=None):
    attrs = f"ID={exon_id};Parent=ENST00000360004.1;gene_name=HLA-DRB1"
    if exon_number is not None:
        attrs += f";exon_number={exon_number}"
    return f"chr6\tHAVANA\texon\t32579000\t32579300\t.\t+\t.\t{attrs}"


# ---------------------------------------------------------------------------
# Basic parsing
# ---------------------------------------------------------------------------

class TestParseLineBasics:

    def test_gene_line(self):
        a = parse_line(_gene_line())
        assert a.type == "gene"
        assert a.chrom == "chr6"
        assert a.start == 32579000
        assert a.end == 32587000
        assert a.strand == "+"
        assert a.gene_name == "HLA-DRB1"

    def test_transcript_line(self):
        a = parse_line(_transcript_line())
        assert a.type == "transcript"
        assert a.parent == "ENSG00000196126.1"

    def test_exon_line(self):
        a = parse_line(_exon_line())
        assert a.type == "exon"

    def test_comment_returns_none(self):
        assert parse_line("##gff-version 3") is None
        assert parse_line("# a comment") is None

    def test_malformed_returns_none(self):
        assert parse_line("too\tfew\tcolumns") is None
        assert parse_line("") is None


# ---------------------------------------------------------------------------
# Attribute extraction
# ---------------------------------------------------------------------------

class TestAttributes:

    def test_exon_number_from_id(self):
        """exon_number parsed from ID like 'exon:ENST...:3'."""
        a = parse_line(_exon_line(exon_id="exon:ENST00000360004.1:3"))
        assert a.exon_number == 3

    def test_exon_number_from_attribute(self):
        """Explicit exon_number attribute overrides ID-based parsing."""
        a = parse_line(_exon_line(exon_id="exon:ENST00000360004.1:1",
                                  exon_number=5))
        assert a.exon_number == 5

    def test_gene_id_set(self):
        a = parse_line(_gene_line(gene_id="ENSG00000196126.1"))
        assert a.id == "ENSG00000196126.1"

    def test_parent_set(self):
        a = parse_line(_transcript_line(parent="ENSG99999.1"))
        assert a.parent == "ENSG99999.1"


# ---------------------------------------------------------------------------
# Type filtering
# ---------------------------------------------------------------------------

class TestTypeFiltering:

    def test_cds_skipped_by_default(self):
        line = "chr6\tHAVANA\tCDS\t100\t200\t.\t+\t.\tID=cds1;gene_name=X"
        assert parse_line(line) is None

    def test_cds_kept_when_enabled(self):
        line = "chr6\tHAVANA\tCDS\t100\t200\t.\t+\t.\tID=cds1;gene_name=X"
        a = parse_line(line, cds=True)
        assert a is not None
        assert a.type == "CDS"

    def test_utr_skipped_by_default(self):
        line = "chr6\tHAVANA\tUTR\t100\t200\t.\t+\t.\tID=utr1;gene_name=X"
        assert parse_line(line) is None

    def test_unknown_type_skipped(self):
        line = "chr6\tHAVANA\tregion\t100\t200\t.\t+\t.\tID=r1;gene_name=X"
        assert parse_line(line) is None


# ---------------------------------------------------------------------------
# MANE / canonical tagging
# ---------------------------------------------------------------------------

class TestTranscriptTags:

    def test_mane_select(self):
        a = parse_line(_transcript_line(tag="MANE_Select,Ensembl_canonical"))
        assert a.mane_select is True
        assert a.ensembl_canonical is True

    def test_no_mane(self):
        a = parse_line(_transcript_line(tag="basic"))
        assert a.mane_select is False
        assert a.ensembl_canonical is False

    def test_canonical_only(self):
        a = parse_line(_transcript_line(tag="Ensembl_canonical"))
        assert a.ensembl_canonical is True
        assert a.mane_select is False

    def test_gene_not_tagged(self):
        """MANE/canonical tagging only applies to transcripts."""
        a = parse_line(_gene_line())
        assert a.mane_select is False
        assert a.ensembl_canonical is False
