"""
Tests for Link serialization, clone, and combine logic.

Graph topology (mini_bubble.gfa) — a two-bubble chain:

         2 (TTTT)                 5 (AAAA)
        /         +              /         +
  1 --              -- 4 --              -- 7    (GRCh38 reference: 1,2,4,5,7)
        +         /              +         /
         3 (CCCC)                 6 (TTTT)         (HG001: 1,3,4,6,7)

  Bubble 1: source=[1], inside={2,3}, sink=[4]
  Bubble 2: source=[4], inside={5,6}, sink=[7]
  Chain 1:  [Bubble_1, Bubble_2]

All segments are 4 bp. Seg 4 = "GGGG", gc_count=4.
"""
import pytest

from pangyplot.objects.Bubble import Bubble
from pangyplot.objects.Chain import Chain
from pangyplot.objects.Link import Link


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_link(from_id, to_id, from_strand="+", to_strand="+",
              haplotype="1", frequency=1.0, gc_count=10, n_count=2,
              length=100, from_type="s", to_type="s", link_type="link"):
    link = Link()
    link.from_id = from_id
    link.to_id = to_id
    link.from_strand = from_strand
    link.to_strand = to_strand
    link.haplotype = haplotype
    link.frequency = frequency
    link.gc_count = gc_count
    link.n_count = n_count
    link.length = length
    link.from_type = from_type
    link.to_type = to_type
    link.link_type = link_type
    return link


def make_bubble(bubble_id, chain_id, chain_step, source_segs, sink_segs, inside_segs):
    b = Bubble()
    b.id = bubble_id
    b.chain = chain_id
    b.chain_step = chain_step
    b.source_segments = list(source_segs)
    b.sink_segments = list(sink_segs)
    b.inside = set(inside_segs)
    b.length = sum(4 for _ in inside_segs)
    return b


# ---------------------------------------------------------------------------
# Link unit tests
# ---------------------------------------------------------------------------

class TestLinkClone:
    def test_clone_copies_basic_fields(self):
        link = make_link(from_id=1, to_id=2, gc_count=10, n_count=3, length=50)
        clone = link.clone()
        assert clone.from_id == 1
        assert clone.to_id == 2
        assert clone.from_strand == "+"
        assert clone.to_strand == "+"
        assert clone.haplotype == "1"
        assert clone.frequency == 1.0
        assert clone.length == 50

    def test_clone_copies_gc_count(self):
        """Regression test: Link.clone() was missing gc_count (Bug 1)."""
        link = make_link(from_id=1, to_id=2, gc_count=42)
        clone = link.clone()
        assert clone.gc_count == 42, \
            "clone() must copy gc_count (was missing before bug fix)"

    def test_clone_copies_n_count(self):
        """Regression test: Link.clone() was missing n_count (Bug 1)."""
        link = make_link(from_id=1, to_id=2, n_count=7)
        clone = link.clone()
        assert clone.n_count == 7, \
            "clone() must copy n_count (was missing before bug fix)"

    def test_clone_is_independent(self):
        link = make_link(from_id=1, to_id=2, gc_count=10)
        clone = link.clone()
        clone.gc_count = 999
        clone.from_id = 99
        assert link.gc_count == 10
        assert link.from_id == 1

    def test_clone_copies_contained_independently(self):
        link = make_link(from_id=1, to_id=2)
        link.contained = [10, 20, 30]
        clone = link.clone()
        assert clone.contained == [10, 20, 30]
        clone.contained.append(40)
        assert link.contained == [10, 20, 30]  # original unaffected

    def test_clone_copies_type_fields(self):
        link = make_link(from_id=1, to_id=2, from_type="b", to_type="b",
                         link_type="chain")
        clone = link.clone()
        assert clone.from_type == "b"
        assert clone.to_type == "b"
        assert clone.link_type == "chain"

class TestLinkCombine:
    def test_haplotype_or(self):
        link1 = make_link(1, 2, haplotype="1")  # 0b01 — sample 0
        link2 = make_link(1, 2, haplotype="2")  # 0b10 — sample 1
        link1.combine_links(link2)
        assert link1.haplotype == "3"            # 0b11 — both samples

    def test_haplotype_or_same_sample(self):
        link1 = make_link(1, 2, haplotype="1")
        link2 = make_link(1, 2, haplotype="1")
        link1.combine_links(link2)
        assert link1.haplotype == "1"

    def test_frequency_accumulates(self):
        link1 = make_link(1, 2, frequency=0.5)
        link2 = make_link(1, 2, frequency=0.5)
        link1.combine_links(link2)
        assert link1.frequency == pytest.approx(1.0)

    def test_gc_count_accumulates(self):
        link1 = make_link(1, 2, gc_count=4)
        link2 = make_link(1, 2, gc_count=6)
        link1.combine_links(link2)
        assert link1.gc_count == 10

    def test_n_count_accumulates(self):
        link1 = make_link(1, 2, n_count=1)
        link2 = make_link(1, 2, n_count=2)
        link1.combine_links(link2)
        assert link1.n_count == 3

    def test_length_accumulates(self):
        link1 = make_link(1, 2, length=100)
        link2 = make_link(1, 2, length=200)
        link1.combine_links(link2)
        assert link1.length == 300

    def test_contained_merges(self):
        link1 = make_link(1, 2)
        link1.contained = [10]
        link2 = make_link(1, 2)
        link2.contained = [20]
        link1.combine_links(link2)
        assert set(link1.contained) == {10, 20}


class TestLinkSerialize:
    def test_source_target_format(self):
        link = make_link(from_id=3, to_id=7, from_type="s", to_type="s")
        d = link.serialize()
        assert d["source"] == "s3"
        assert d["target"] == "s7"

    def test_chain_link_type(self):
        link = make_link(1, 2, from_type="b", to_type="b", link_type="chain")
        d = link.serialize()
        assert d["type"] == "chain"

    def test_link_id_includes_types(self):
        link = make_link(from_id=1, to_id=2, from_type="s", to_type="s")
        assert link.id() == "s1+s2+"


class TestBubbleSerialize:
    def test_serialize_includes_source_sink_segs(self):
        """Bubble.serialize() must include source_segs and sink_segs."""
        b = make_bubble(1, 1, 0, source_segs=[1], sink_segs=[4], inside_segs=[2, 3])
        d = b.serialize()
        assert d["source_segs"] == [1]
        assert d["sink_segs"] == [4]
        assert d["type"] == "bubble"

    def test_siblings_assigned_in_chain(self):
        b1 = make_bubble(1, 1, 0, source_segs=[1], sink_segs=[4], inside_segs=[2, 3])
        b2 = make_bubble(2, 1, 1, source_segs=[4], sink_segs=[7], inside_segs=[5, 6])
        chain = Chain(1, [b1, b2])
        assert b1.siblings[0] is None
        assert b1.siblings[1] == b2.id
        assert b2.siblings[0] == b1.id
        assert b2.siblings[1] is None
