import json
import math
import pathlib
import re
import shutil
import struct
import subprocess

import pytest

from pangyplot.preprocess.parser.parse_layout import parse_layout
from pangyplot.utils import layout_writer

ODGI = shutil.which("odgi") or "/home/scott/bin/odgi"


# ---------------------------------------------------------------------------
# A decoder mirroring odgi's Layout::load, so the .lay writer is verified
# without needing the odgi binary.
# ---------------------------------------------------------------------------

def _read_int_vector(data, offset):
    bit_size = struct.unpack_from('<Q', data, offset)[0]
    width = struct.unpack_from('<B', data, offset + 8)[0]
    offset += 9
    n_words = (bit_size + 63) // 64
    acc = 0
    for i in range(n_words):
        word = struct.unpack_from('<Q', data, offset + 8 * i)[0]
        acc |= word << (64 * i)
    offset += 8 * n_words
    count = bit_size // width if width else 0
    values = [(acc >> (i * width)) & ((1 << width) - 1) for i in range(count)]
    return values, offset, acc


def _decode_lay(data):
    min_value = struct.unpack_from('<d', data, 0)[0]
    size = struct.unpack_from('<Q', data, 8)[0]

    z_bits = struct.unpack_from('<Q', data, 16)[0]
    _, offset, z_acc = _read_int_vector(data, 16)
    samples, _, _ = _read_int_vector(data, offset)

    def read_unary(pos):
        n = 0
        while not (z_acc >> (pos + n)) & 1:
            n += 1
        return n

    values = []
    pos = 0
    current = 0
    for i in range(size):
        if i % layout_writer.SAMPLE_DENS == 0:
            current = samples[(i // layout_writer.SAMPLE_DENS) * 2]
        else:
            len_1_len = read_unary(pos)
            pos += len_1_len + 1
            if len_1_len == 0:
                delta = 1
            else:
                # The leading 1 of the length field is implicit.
                length = ((z_acc >> pos) & ((1 << len_1_len) - 1)) + (1 << len_1_len)
                pos += len_1_len
                rest = (z_acc >> pos) & ((1 << (length - 1)) - 1)
                pos += length - 1
                delta = (rest + (1 << (length - 1))) & 0xFFFFFFFFFFFFFFFF
            current = (current + delta) & 0xFFFFFFFFFFFFFFFF
        values.append(current)

    assert z_bits == pos or z_bits >= pos
    coords = [struct.unpack('<d', struct.pack('<Q', v))[0] + min_value for v in values]
    return [(coords[i], coords[i + 1]) for i in range(0, len(coords), 2)]


def test_build_id_map_compacts_to_one_based_range():
    ordered, id_map = layout_writer.build_id_map([9999, 100, 250])

    assert ordered == [100, 250, 9999]
    assert id_map == {100: 1, 250: 2, 9999: 3}


def test_lay_roundtrips_handles():
    handles = [(0.0, 0.0, 10.5, -3.25), (10.5, -3.25, 20.0, 4.0)]

    coords = _decode_lay(layout_writer.write_lay(handles))

    assert coords == [(0.0, 0.0), (10.5, -3.25), (10.5, -3.25), (20.0, 4.0)]


def test_lay_roundtrips_beyond_one_sample_block():
    # >128 coordinate entries exercises enc_vector's sampling/pointer path.
    handles = [
        (float(i), math.sin(i / 10) * 100, float(i) + 0.5, math.cos(i / 10) * 100)
        for i in range(300)
    ]

    coords = _decode_lay(layout_writer.write_lay(handles))

    assert len(coords) == 600
    for i, (x1, y1, x2, y2) in enumerate(handles):
        assert coords[2 * i] == pytest.approx((x1, y1))
        assert coords[2 * i + 1] == pytest.approx((x2, y2))


def test_lay_handles_negative_coordinates():
    handles = [(-500.0, -250.0, -100.0, 250.0)]

    coords = _decode_lay(layout_writer.write_lay(handles))

    assert coords == [(-500.0, -250.0), (-100.0, 250.0)]


def test_lay_of_empty_graph_is_readable():
    assert _decode_lay(layout_writer.write_lay([])) == []


def test_bandage_parses_with_the_real_layout_parser(tmp_path):
    polylines = {
        1: [(0.0, 0.0), (5.0, 1.0), (10.0, 2.0)],
        2: [(10.0, 2.0), (20.0, -4.0)],
    }

    path = tmp_path / "layout.json"
    path.write_text(layout_writer.write_bandage(polylines))
    parsed = parse_layout(str(path))

    assert parsed["type"] == "bandage"
    # The parser keeps only the endpoints of each polyline.
    assert parsed["layout"][1] == {"x1": 0.0, "y1": 0.0, "x2": 10.0, "y2": 2.0}
    assert parsed["layout"][2] == {"x1": 10.0, "y1": 2.0, "x2": 20.0, "y2": -4.0}


def test_bandage_keeps_intermediate_polyline_points():
    data = json.loads(layout_writer.write_bandage({1: [(0.0, 0.0), (5.0, 1.0), (10.0, 2.0)]}))

    # BandageNG keys nodes by name and orientation.
    assert data["1+"] == [[0.0, 0.0], [5.0, 1.0], [10.0, 2.0]]


def test_bandage_skips_segments_with_no_points():
    assert json.loads(layout_writer.write_bandage({1: [], 2: [(0.0, 0.0)]})) == {"2+": [[0.0, 0.0]]}


@pytest.mark.skipif(not shutil.which(ODGI), reason="odgi binary not available")
def test_odgi_draw_accepts_our_lay(tmp_path):
    gfa = tmp_path / "g.gfa"
    gfa.write_text(
        "H\tVN:Z:1.0\n"
        "S\t1\tACGTACGTAA\n"
        "S\t2\tTTTT\n"
        "S\t3\tGGGGCC\n"
        "L\t1\t+\t2\t+\t0M\n"
        "L\t2\t+\t3\t+\t0M\n"
        "P\thap#1#chr1\t1+,2+,3+\t*\n"
    )
    og = tmp_path / "g.og"
    subprocess.run([ODGI, "build", "-g", str(gfa), "-o", str(og)], check=True,
                   capture_output=True)

    handles = [(0.0, 0.0, 100.0, 0.0), (100.0, 0.0, 200.0, 50.0), (200.0, 50.0, 300.0, 0.0)]
    lay = tmp_path / "g.lay"
    lay.write_bytes(layout_writer.write_lay(handles))

    out = tmp_path / "rt.tsv"
    subprocess.run([ODGI, "draw", "-i", str(og), "-c", str(lay), "-T", str(out)],
                   check=True, capture_output=True)

    rows = [line.split("\t") for line in out.read_text().splitlines()[1:]]
    expected = [c for h in handles for c in ((h[0], h[1]), (h[2], h[3]))]
    assert len(rows) == len(expected)
    for row, (x, y) in zip(rows, expected):
        assert float(row[1]) == pytest.approx(x)
        assert float(row[2]) == pytest.approx(y)


# ---------------------------------------------------------------------------
# Bandage compatibility, pinned against a file BandageNG itself produced
# (tests/fixtures/layout/bandage_real.layout). Our own parser strips non-digits
# from the key, so it accepts almost anything -- round-tripping through it does
# not prove Bandage would read what we write.
# ---------------------------------------------------------------------------

BANDAGE_FIXTURE = (pathlib.Path(__file__).parent.parent
                   / "fixtures" / "layout" / "bandage_real.layout")


def test_our_bandage_keys_match_bandage_s_own():
    real = json.loads(BANDAGE_FIXTURE.read_text())

    ours = json.loads(layout_writer.write_bandage(
        {1: [(0.0, 0.0), (1.0, 1.0)], 2: [(2.0, 2.0), (3.0, 3.0)]}))

    assert set(ours) == {"1+", "2+"}
    assert all(re.fullmatch(r"\d+[+-]", key) for key in real)
    assert all(re.fullmatch(r"\d+[+-]", key) for key in ours)


def test_our_bandage_values_match_bandage_s_shape():
    real = json.loads(BANDAGE_FIXTURE.read_text())

    ours = json.loads(layout_writer.write_bandage({1: [(0.0, 0.0), (1.0, 2.0)]}))

    def shape(points):
        return all(isinstance(p, list) and len(p) == 2
                   and all(isinstance(c, float) for c in p) for p in points)

    assert all(shape(points) for points in real.values())
    assert all(shape(points) for points in ours.values())
