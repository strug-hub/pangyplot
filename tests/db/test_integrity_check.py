"""Tests for integrity_check: deduplicate_links, deduplicate_nodes, remove_invalid_links."""

from pangyplot.db.integrity_check import (
    deduplicate_links,
    deduplicate_nodes,
    remove_invalid_links,
)


class _FakeLink:
    def __init__(self, from_id, to_id):
        self.from_id = from_id
        self.to_id = to_id

    def id(self):
        return f"{self.from_id}+{self.to_id}+"


class _FakeNode:
    def __init__(self, id):
        self.id = id


# ---------------------------------------------------------------------------
# deduplicate_links
# ---------------------------------------------------------------------------

class TestDeduplicateLinks:

    def test_removes_duplicates(self):
        a = _FakeLink(1, 2)
        b = _FakeLink(1, 2)  # same id() as a
        assert len(deduplicate_links([a, b])) == 1

    def test_preserves_order(self):
        a = _FakeLink(1, 2)
        b = _FakeLink(3, 4)
        c = _FakeLink(1, 2)
        result = deduplicate_links([a, b, c])
        assert result == [a, b]

    def test_skips_none(self):
        a = _FakeLink(1, 2)
        result = deduplicate_links([None, a, None])
        assert result == [a]

    def test_empty_input(self):
        assert deduplicate_links([]) == []


# ---------------------------------------------------------------------------
# deduplicate_nodes
# ---------------------------------------------------------------------------

class TestDeduplicateNodes:

    def test_removes_duplicates(self):
        a = _FakeNode("s1")
        b = _FakeNode("s1")
        assert len(deduplicate_nodes([a, b])) == 1

    def test_preserves_order(self):
        a = _FakeNode("s1")
        b = _FakeNode("s2")
        c = _FakeNode("s1")
        result = deduplicate_nodes([a, b, c])
        assert result == [a, b]

    def test_skips_none(self):
        a = _FakeNode("s1")
        result = deduplicate_nodes([None, a, None])
        assert result == [a]

    def test_empty_input(self):
        assert deduplicate_nodes([]) == []


# ---------------------------------------------------------------------------
# remove_invalid_links
# ---------------------------------------------------------------------------

class TestRemoveInvalidLinks:

    def test_keeps_valid_links(self):
        nodes = [_FakeNode(1), _FakeNode(2)]
        link = _FakeLink(1, 2)
        assert remove_invalid_links(nodes, [link]) == [link]

    def test_removes_missing_from_id(self):
        nodes = [_FakeNode(2)]
        link = _FakeLink(1, 2)
        assert remove_invalid_links(nodes, [link]) == []

    def test_removes_missing_to_id(self):
        nodes = [_FakeNode(1)]
        link = _FakeLink(1, 2)
        assert remove_invalid_links(nodes, [link]) == []

    def test_explicit_ids_parameter(self):
        link = _FakeLink(1, 2)
        assert remove_invalid_links([], [link], ids={1, 2}) == [link]
        assert remove_invalid_links([], [link], ids={1}) == []
