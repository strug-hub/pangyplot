"""Delta-zigzag-varint codec for compressed path storage (.binpath format).

File layout:
    [4 bytes: uint32 LE — header JSON length N]
    [N bytes: UTF-8 JSON metadata (no "path" field)]
    [remaining bytes: gzipped delta-zigzag-varint payload]

Each step "ID+/-" is encoded as a combined value: (segment_id << 1) | dir_bit
where + = 0, - = 1. The first step is varint-encoded directly; subsequent steps
are delta-zigzag-varint encoded against the previous combined value.
"""

import gzip
import json
import struct

FORMAT_VERSION = 1


# -------------------------------------------------------------------
# Varint helpers
# -------------------------------------------------------------------

def _write_varint(buf, value):
    """Append an unsigned varint to a bytearray."""
    while value > 0x7F:
        buf.append((value & 0x7F) | 0x80)
        value >>= 7
    buf.append(value & 0x7F)


def _read_varint(data, offset):
    """Read an unsigned varint from bytes at offset. Returns (value, new_offset)."""
    result = 0
    shift = 0
    while True:
        b = data[offset]
        result |= (b & 0x7F) << shift
        offset += 1
        if not (b & 0x80):
            break
        shift += 7
    return result, offset


# -------------------------------------------------------------------
# Zigzag helpers (signed <-> unsigned for small-magnitude efficiency)
# -------------------------------------------------------------------

def _zigzag_encode(n):
    return (n << 1) ^ (n >> 63)


def _zigzag_decode(n):
    return (n >> 1) ^ -(n & 1)


# -------------------------------------------------------------------
# Step encoding / decoding
# -------------------------------------------------------------------

def _parse_step(step_str):
    """Parse "101+" into (101, "+")."""
    return int(step_str[:-1]), step_str[-1]


def _combine(seg_id, direction):
    return (seg_id << 1) | (0 if direction == '+' else 1)


def _uncombine(combined):
    return combined >> 1, '+' if (combined & 1) == 0 else '-'


def encode_steps(steps):
    """Encode a list of step strings into gzipped delta-zigzag-varint bytes.

    Args:
        steps: list of strings like ["1+", "2+", "305-"]

    Returns:
        bytes — gzip-compressed varint stream
    """
    if not steps:
        return gzip.compress(b'')

    buf = bytearray()
    prev = 0

    for i, step in enumerate(steps):
        seg_id, direction = _parse_step(step)
        combined = _combine(seg_id, direction)

        if i == 0:
            _write_varint(buf, combined)
        else:
            delta = combined - prev
            _write_varint(buf, _zigzag_encode(delta))

        prev = combined

    return gzip.compress(bytes(buf))


def decode_steps(data):
    """Decode gzipped delta-zigzag-varint bytes back to step strings.

    Args:
        data: bytes — gzip-compressed varint stream

    Returns:
        list of strings like ["1+", "2+", "305-"]
    """
    raw = gzip.decompress(data)
    if not raw:
        return []

    steps = []
    offset = 0
    prev = 0

    first = True
    while offset < len(raw):
        value, offset = _read_varint(raw, offset)

        if first:
            combined = value
            first = False
        else:
            delta = _zigzag_decode(value)
            combined = prev + delta

        seg_id, direction = _uncombine(combined)
        steps.append(f"{seg_id}{direction}")
        prev = combined

    return steps


# -------------------------------------------------------------------
# .binpath file I/O
# -------------------------------------------------------------------

def write_binpath(filepath, metadata, steps):
    """Write a .binpath file with JSON header + compressed path payload.

    Args:
        filepath: output path
        metadata: dict with path metadata (full_id, sample, hap, etc.)
        steps: list of step strings
    """
    meta = {**metadata, "v": FORMAT_VERSION}
    meta.pop("path", None)
    header_bytes = json.dumps(meta, separators=(',', ':')).encode('utf-8')
    payload = encode_steps(steps)

    with open(filepath, 'wb') as f:
        f.write(struct.pack('<I', len(header_bytes)))
        f.write(header_bytes)
        f.write(payload)


def read_binpath(filepath):
    """Read a .binpath file. Returns (metadata_dict, steps_list)."""
    with open(filepath, 'rb') as f:
        header_len = struct.unpack('<I', f.read(4))[0]
        header_bytes = f.read(header_len)
        payload = f.read()

    metadata = json.loads(header_bytes.decode('utf-8'))
    steps = decode_steps(payload)
    return metadata, steps
