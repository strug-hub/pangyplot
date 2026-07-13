"""Layout serialization for exported subgraphs.

Two formats are written for every layout export:

- ``.lay``   — odgi's binary layout, the only form ``odgi draw`` accepts.
- ``.json``  — Bandage-style layout, which can carry a full polyline per
               segment rather than just its two endpoints.

odgi addresses layout coordinates positionally (``idx = 2 * rank + end``) and
rejects graphs whose node IDs are not compacted to 1..N. So an exported GFA and
its layout are only usable together if both are renumbered with the *same* map.
``build_id_map`` is that single source of truth -- callers must renumber the GFA
through it as well.
"""

import json
import struct

SAMPLE_DENS = 128


def build_id_map(segment_ids):
    """Map original segment IDs to compacted odgi IDs (1..N), ordered by ID.

    Returns ``(ordered_ids, id_map)``: the original IDs in rank order, and
    ``{original: compacted}``.
    """
    ordered = sorted(segment_ids, key=int)
    return ordered, {sid: i + 1 for i, sid in enumerate(ordered)}


# ---------------------------------------------------------------------------
# odgi .lay -- double min_value, then an sdsl enc_vector<elias_delta, 128> of
# the IEEE-754 bit patterns of (coord - min_value), two handles per segment.
# ---------------------------------------------------------------------------

def _hi(x):
    return x.bit_length() - 1


class _BitWriter:
    """Little-endian bit stream.

    Writes into a bytearray rather than one growing int: a whole-chromosome
    export is millions of bits, and shifting a multi-megabyte int on every
    write is quadratic.
    """

    def __init__(self):
        self._buf = bytearray()
        self._pos = 0

    def write(self, value, length):
        if not length:
            return
        value &= (1 << length) - 1
        offset = self._pos & 7
        start = self._pos >> 3
        needed = (self._pos + length + 7) // 8
        if needed > len(self._buf):
            self._buf.extend(bytes(needed - len(self._buf)))

        chunk = value << offset
        for i in range((offset + length + 7) // 8):
            self._buf[start + i] |= (chunk >> (8 * i)) & 0xFF
        self._pos += length

    def words(self):
        padded = bytes(self._buf) + bytes(-len(self._buf) % 8)
        return [struct.unpack_from('<Q', padded, i)[0]
                for i in range(0, len(padded), 8)]


def _elias_delta_length(x):
    len_1 = _hi(x) if x else 64
    return len_1 + (_hi(len_1 + 1) << 1) + 1


def _elias_delta_encode(writer, x):
    length = (_hi(x) + 1) if x else 65
    len_1_len = _hi(length)
    writer.write(1 << len_1_len, len_1_len + 1)
    if len_1_len:
        writer.write(length, len_1_len)
        writer.write(x, length - 1)


def _int_vector(values, width):
    writer = _BitWriter()
    for value in values:
        writer.write(value, width)
    words = writer.words()
    out = bytearray()
    out += struct.pack('<Q', len(values) * width)
    out += struct.pack('<B', width)
    out += struct.pack(f'<{len(words)}Q', *words)
    return bytes(out)


def _enc_vector(values):
    if not values:
        return struct.pack('<Q', 0) + _int_vector([], 1) + _int_vector([], 1)

    z_size = 0
    samples = 0
    max_sample = 0
    countdown = 0
    previous = values[0]
    for value in values:
        if not countdown:
            countdown = SAMPLE_DENS
            max_sample = max(max_sample, value)
            samples += 1
        else:
            z_size += _elias_delta_length((value - previous) & 0xFFFFFFFFFFFFFFFF)
        countdown -= 1
        previous = value

    if max_sample > z_size + 1:
        width = _hi(max_sample) + 1
    else:
        width = _hi(z_size + 1) + 1

    sample_vals = []
    writer = _BitWriter()
    running = 0
    countdown = 0
    previous = values[0]
    for value in values:
        if not countdown:
            countdown = SAMPLE_DENS
            sample_vals.append(value)
            sample_vals.append(running)
        else:
            delta = (value - previous) & 0xFFFFFFFFFFFFFFFF
            running += _elias_delta_length(delta)
            _elias_delta_encode(writer, delta)
        countdown -= 1
        previous = value
    sample_vals.append(0)
    sample_vals.append(running + 1)

    words = writer.words()
    encoded = bytearray()
    encoded += struct.pack('<Q', running)
    encoded += struct.pack('<B', 1)
    encoded += struct.pack(f'<{len(words)}Q', *words)

    return (struct.pack('<Q', len(values)) + bytes(encoded)
            + _int_vector(sample_vals, width))


def write_lay(handles):
    """Serialize a .lay file from ``[(x1, y1, x2, y2), ...]`` in rank order."""
    coords = []
    for x1, y1, x2, y2 in handles:
        coords.append((x1, y1))
        coords.append((x2, y2))

    if not coords:
        return struct.pack('<d', 0.0) + _enc_vector([])

    min_value = min(min(x, y) for x, y in coords)
    values = []
    for x, y in coords:
        values.append(struct.unpack('<Q', struct.pack('<d', x - min_value))[0])
        values.append(struct.unpack('<Q', struct.pack('<d', y - min_value))[0])

    return struct.pack('<d', min_value) + _enc_vector(values)


# ---------------------------------------------------------------------------
# Bandage layout -- {node_id: [[x, y], ...]}. Read back by
# preprocess.parser.parse_layout.parse_bandage_layout.
# ---------------------------------------------------------------------------

def fit_similarity(source, target):
    """Fit the similarity transform (scale, rotation, translation) mapping
    ``source`` points onto ``target`` points, least-squares.

    Used to place segments that only have stored odgi coordinates into the
    viewer's refined frame. With fewer than two point pairs there is nothing to
    fit, so the identity transform is returned.
    """
    n = min(len(source), len(target))
    if n < 2:
        return (1.0, 0.0, 0.0, 0.0)

    sx = sum(p[0] for p in source[:n]) / n
    sy = sum(p[1] for p in source[:n]) / n
    tx = sum(p[0] for p in target[:n]) / n
    ty = sum(p[1] for p in target[:n]) / n

    num_cos = num_sin = denom = 0.0
    for (px, py), (qx, qy) in zip(source[:n], target[:n]):
        ax, ay = px - sx, py - sy
        bx, by = qx - tx, qy - ty
        num_cos += ax * bx + ay * by
        num_sin += ax * by - ay * bx
        denom += ax * ax + ay * ay

    if denom == 0:
        return (1.0, 0.0, tx - sx, ty - sy)

    a = num_cos / denom      # scale * cos(theta)
    b = num_sin / denom      # scale * sin(theta)
    return (a, b, tx - (a * sx - b * sy), ty - (b * sx + a * sy))


def apply_similarity(transform, point):
    a, b, dx, dy = transform
    x, y = point
    return (a * x - b * y + dx, b * x + a * y + dy)


def write_bandage(polylines):
    """Serialize a Bandage ``.layout`` from ``{node_id: [(x, y), ...]}``.

    BandageNG keys nodes by name and orientation (``"12+"``), and stores a full
    polyline per node rather than just its endpoints.
    """
    data = {
        f"{node_id}+": [[float(x), float(y)] for x, y in points]
        for node_id, points in polylines.items()
        if points
    }
    return json.dumps(data, indent=4)
