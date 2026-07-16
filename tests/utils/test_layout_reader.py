"""Tests for pangyplot/utils/layout_reader.py

read_lay() decodes odgi's binary .lay -- a double `min_value` followed by an
sdsl enc_vector<elias_delta, 128> of the IEEE-754 bit patterns of every
(coord - min_value), four values per segment (x1, y1, x2, y2).

The load-bearing test is against a real odgi-produced .lay and the .lay.tsv
odgi's own loader dumps from it (`odgi draw -c FILE -T FILE`), so the decoder is
checked against odgi rather than against our own writer. The fixture holds 300
segments = 1200 values, which crosses nine 128-value sample boundaries -- the
part a tiny graph would never exercise.

The .tsv is compared with a tolerance because it is the *lossy* side: odgi
writes it at `digits10 + 1` (16) significant digits, one short of the 17 a
double needs to round-trip exactly. The .lay carries exact bits.
"""
import struct

import pytest

from pangyplot.utils.layout_reader import (
    read_lay, _BitReader, _elias_delta_decode)
from pangyplot.utils.layout_writer import (
    write_lay, _BitWriter, _elias_delta_encode)


@pytest.fixture(scope="module")
def odgi_lay(fixtures_dir):
    return (fixtures_dir / "layout" / "odgi_real.lay").read_bytes()


@pytest.fixture(scope="module")
def odgi_tsv_coords(fixtures_dir):
    """The (X, Y) rows odgi itself dumped from that .lay -- two rows/segment."""
    rows = []
    with open(fixtures_dir / "layout" / "odgi_real.lay.tsv") as f:
        next(f)  # header
        for line in f:
            cols = line.split("\t")
            rows.append((float(cols[1]), float(cols[2])))
    return rows


class TestAgainstRealOdgi:

    def test_matches_odgi_own_tsv_dump(self, odgi_lay, odgi_tsv_coords):
        x1, y1, x2, y2 = read_lay(odgi_lay)
        assert len(x1) * 2 == len(odgi_tsv_coords)
        for i in range(len(x1)):
            start_x, start_y = odgi_tsv_coords[2 * i]
            end_x, end_y = odgi_tsv_coords[2 * i + 1]
            assert x1[i] == pytest.approx(start_x, abs=1e-9)
            assert y1[i] == pytest.approx(start_y, abs=1e-9)
            assert x2[i] == pytest.approx(end_x, abs=1e-9)
            assert y2[i] == pytest.approx(end_y, abs=1e-9)

    def test_fixture_crosses_sample_boundaries(self, odgi_lay):
        # Guards the guard: if this fixture ever shrank under 128 values, the
        # test above would stop covering delta decoding across samples.
        x1, _, _, _ = read_lay(odgi_lay)
        assert len(x1) * 4 > 128 * 4


class TestEliasDelta:

    @pytest.mark.parametrize("value", [0, 1, 2, 3, 127, 128, 255, 65535,
                                       2**31, 2**63, 2**64 - 1])
    def test_round_trip(self, value):
        writer = _BitWriter()
        _elias_delta_encode(writer, value)
        payload = b"".join(struct.pack("<Q", w) for w in writer.words())
        assert _elias_delta_decode(_BitReader(payload)) == value

    def test_sequential_codes(self):
        values = [0, 1, 5, 2**64 - 1, 300, 7]
        writer = _BitWriter()
        for v in values:
            _elias_delta_encode(writer, v)
        payload = b"".join(struct.pack("<Q", w) for w in writer.words())
        reader = _BitReader(payload)
        assert [_elias_delta_decode(reader) for _ in values] == values


class TestRoundTripWithWriter:

    def test_write_then_read(self):
        handles = [(0.0, 0.0, 10.0, 10.5), (20.25, -5.0, 30.0, 30.0),
                   (-100.5, 2.5, -90.0, 3.5)]
        x1, y1, x2, y2 = read_lay(write_lay(handles))
        assert list(zip(x1, y1, x2, y2)) == pytest.approx(handles)

    def test_round_trip_across_sample_boundary(self):
        # >128 values so the decoder must resync on samples, not just deltas.
        handles = [(float(i), float(i) * 1.5, float(i) + 0.25, float(i) * 2)
                   for i in range(200)]
        x1, y1, x2, y2 = read_lay(write_lay(handles))
        assert list(zip(x1, y1, x2, y2)) == pytest.approx(handles)

    def test_empty(self):
        x1, y1, x2, y2 = read_lay(write_lay([]))
        assert len(x1) == len(y1) == len(x2) == len(y2) == 0
