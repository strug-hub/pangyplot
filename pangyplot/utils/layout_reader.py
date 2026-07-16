"""Read odgi's binary ``.lay`` layout -- the inverse of ``layout_writer.write_lay``.

odgi serializes a layout as a double ``min_value`` followed by an
``sdsl::enc_vector<elias_delta, 128>`` holding the IEEE-754 bit patterns of
every ``coord - min_value``. The values are flat, four per segment
(``x1, y1, x2, y2``): odgi gives each node two handle ends, and stores an x and
a y for each.

``enc_vector`` keeps every 128th value verbatim (a *sample*) and elias-delta
codes the wrapped 64-bit delta between neighbours. Random access needs the
sample pointers to know where a code starts; a full sequential read does not --
so this decoder walks the delta stream once and resets to the sample value every
128 values, ignoring the pointers entirely.
"""

import struct
from array import array

SAMPLE_DENS = 128
MASK64 = 0xFFFFFFFFFFFFFFFF


class _BitReader:
    """Little-endian bit stream -- the read side of layout_writer._BitWriter.

    Bits go in LSB-first, so a value written at bit ``p`` is read back by
    shifting the byte window down by ``p & 7``.
    """

    __slots__ = ["_buf", "_pos"]

    def __init__(self, buf):
        self._buf = buf
        self._pos = 0

    def read(self, length):
        if not length:
            return 0
        start = self._pos >> 3
        offset = self._pos & 7
        nbytes = (offset + length + 7) >> 3
        window = int.from_bytes(self._buf[start:start + nbytes], "little")
        self._pos += length
        return (window >> offset) & ((1 << length) - 1)

    def read_unary_zeros(self):
        """Count zero bits up to the next 1, consuming the 1 as well.

        Scans a word at a time rather than bit by bit -- the delta stream holds
        millions of codes, and a per-bit loop dominates the decode.
        """
        count = 0
        while True:
            start = self._pos >> 3
            offset = self._pos & 7
            window = int.from_bytes(self._buf[start:start + 9], "little") >> offset
            if window == 0:
                # No 1 bit in reach; skip the whole window and keep looking.
                count += 64
                self._pos += 64
                continue
            low = (window & -window).bit_length() - 1
            count += low
            self._pos += low + 1
            return count


def _elias_delta_decode(reader):
    """Inverse of layout_writer._elias_delta_encode.

    ``x == 0`` needs no special case: the encoder stores it as length 65, and
    ``(1 << 64) | 0`` masks back to 0.
    """
    len_1_len = reader.read_unary_zeros()
    length = (1 << len_1_len) | reader.read(len_1_len)
    return ((1 << (length - 1)) | reader.read(length - 1)) & MASK64


def _read_int_vector(data, offset):
    """Read an sdsl ``int_vector<0>``: size in bits, width byte, 64-bit words.

    Returns ``(payload, width, size_bits, next_offset)``.
    """
    size_bits = struct.unpack_from("<Q", data, offset)[0]
    offset += 8
    width = data[offset]
    offset += 1
    nwords = (size_bits + 63) // 64
    payload = data[offset:offset + nwords * 8]
    offset += nwords * 8
    return payload, width, size_bits, offset


def _decode_enc_vector(data, offset):
    """Decode an enc_vector into its list of uint64 values."""
    count = struct.unpack_from("<Q", data, offset)[0]
    offset += 8
    z_payload, _, _, offset = _read_int_vector(data, offset)
    sv_payload, sv_width, sv_bits, offset = _read_int_vector(data, offset)

    if not count:
        return [], offset

    # sample_vals_and_pointer alternates (value, pointer); only the values are
    # needed for a sequential walk.
    sv_reader = _BitReader(sv_payload)
    n_sv = sv_bits // sv_width if sv_width else 0
    samples = [sv_reader.read(sv_width) for _ in range(n_sv)]

    values = []
    append = values.append
    z = _BitReader(z_payload)
    current = 0
    for i in range(count):
        if i % SAMPLE_DENS == 0:
            current = samples[(i // SAMPLE_DENS) << 1]
        else:
            current = (current + _elias_delta_decode(z)) & MASK64
        append(current)
    return values, offset


def read_lay(data):
    """Decode a ``.lay`` byte string into four packed coordinate arrays.

    Returns ``(x1, y1, x2, y2)`` as ``array('d')``, one entry per segment in
    odgi rank order -- the layout of ``parse_layout.OdgiLayout``. Returning
    arrays rather than the ``[(x1, y1, x2, y2), ...]`` that ``write_lay``
    accepts is deliberate: a tuple per segment costs far more than the coords on
    a whole chromosome.
    """
    min_value = struct.unpack_from("<d", data, 0)[0]
    values, _ = _decode_enc_vector(data, 8)

    # Reinterpret the uint64 bit patterns as doubles in one pass -- struct per
    # value would be millions of calls.
    doubles = array("d")
    doubles.frombytes(array("Q", values).tobytes())

    coords = []
    for start in range(4):
        chunk = doubles[start::4]
        coords.append(array("d", (v + min_value for v in chunk)))
    return tuple(coords)
