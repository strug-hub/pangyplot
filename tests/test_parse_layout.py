"""
Tests for pangyplot/preprocess/parser/parse_layout.py

parse_layout() auto-detects format (odgi TSV vs Bandage JSON) and returns a
dict {"type": ..., "layout": ...} used to assign x/y coordinates to segments.

odgi layout: pairs of rows per segment (start and end point of the segment's
drawn line). Rows come in pairs after skipping the header; row pairs (0,1),
(2,3), (4,5)... correspond to segments in GFA S-line order.

Bandage layout: JSON dict keyed by node names; coords are a list of [x,y]
points; first and last points become x1/y1 and x2/y2.
"""
import io
import pytest
from pangyplot.preprocess.parser.parse_layout import (
    parse_layout,
    parse_odgi_layout,
    parse_bandage_layout,
)


class TestFormatAutoDetection:
    def test_odgi_detected_by_non_json_first_line(self, mini_odgi_layout):
        result = parse_layout(str(mini_odgi_layout))
        assert result["type"] == "odgi"

    def test_bandage_detected_by_json_first_line(self, mini_bandage_layout):
        result = parse_layout(str(mini_bandage_layout))
        assert result["type"] == "bandage"


class TestOdgiLayout:
    def test_segment_count(self, mini_odgi_layout):
        # 6 segments → 6 coordinate entries
        result = parse_odgi_layout(str(mini_odgi_layout))
        assert len(result["layout"]) == 6

    def test_first_segment_coords(self, mini_odgi_layout):
        # Row pair 0,1: x1=0.0, y1=0.0 (row 0); x2=10.0, y2=10.0 (row 1)
        result = parse_odgi_layout(str(mini_odgi_layout))
        seg = result["layout"][0]
        assert seg["x1"] == pytest.approx(0.0)
        assert seg["y1"] == pytest.approx(0.0)
        assert seg["x2"] == pytest.approx(10.0)
        assert seg["y2"] == pytest.approx(10.0)

    def test_second_segment_coords(self, mini_odgi_layout):
        # Row pair 2,3: x1=20.0, y1=20.0; x2=30.0, y2=30.0
        result = parse_odgi_layout(str(mini_odgi_layout))
        seg = result["layout"][1]
        assert seg["x1"] == pytest.approx(20.0)
        assert seg["y1"] == pytest.approx(20.0)
        assert seg["x2"] == pytest.approx(30.0)
        assert seg["y2"] == pytest.approx(30.0)

    def test_last_segment_coords(self, mini_odgi_layout):
        # Row pair 10,11 (segment 6): x1=100.0; x2=110.0
        result = parse_odgi_layout(str(mini_odgi_layout))
        seg = result["layout"][5]
        assert seg["x1"] == pytest.approx(100.0)
        assert seg["x2"] == pytest.approx(110.0)

    def test_result_type_field(self, mini_odgi_layout):
        result = parse_odgi_layout(str(mini_odgi_layout))
        assert result["type"] == "odgi"


class TestBandageLayout:
    def test_segment_count(self, mini_bandage_layout):
        result = parse_bandage_layout(str(mini_bandage_layout))
        assert len(result["layout"]) == 6

    def test_node_keys_are_integers(self, mini_bandage_layout):
        result = parse_bandage_layout(str(mini_bandage_layout))
        for key in result["layout"]:
            assert isinstance(key, int)

    def test_non_digit_prefix_stripped(self, mini_bandage_layout):
        # "node_1" → key 1
        result = parse_bandage_layout(str(mini_bandage_layout))
        assert 1 in result["layout"]
        assert 6 in result["layout"]

    def test_first_node_coords(self, mini_bandage_layout):
        # node_1: start=[0.0, 0.0], end=[10.0, 10.0]
        result = parse_bandage_layout(str(mini_bandage_layout))
        seg = result["layout"][1]
        assert seg["x1"] == pytest.approx(0.0)
        assert seg["y1"] == pytest.approx(0.0)
        assert seg["x2"] == pytest.approx(10.0)
        assert seg["y2"] == pytest.approx(10.0)

    def test_last_node_coords(self, mini_bandage_layout):
        result = parse_bandage_layout(str(mini_bandage_layout))
        seg = result["layout"][6]
        assert seg["x1"] == pytest.approx(100.0)
        assert seg["x2"] == pytest.approx(110.0)

    def test_result_type_field(self, mini_bandage_layout):
        result = parse_bandage_layout(str(mini_bandage_layout))
        assert result["type"] == "bandage"
