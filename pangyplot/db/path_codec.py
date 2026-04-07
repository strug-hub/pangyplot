"""Delta-zigzag-varint codec for compressed path storage (.binpath format).

Storage layout (split format):
    paths/index.json  — metadata for all paths + pangyplot version
    paths/*.binpath   — pure gzipped delta-zigzag-varint payload (no header)

Each step "ID+/-" is encoded as a combined value: (segment_id << 1) | dir_bit
where + = 0, - = 1. The first step is varint-encoded directly; subsequent steps
are delta-zigzag-varint encoded against the previous combined value.
"""

import gzip
import json
import os

from pangyplot.version import __version__

INDEX_FILENAME = "index.json"


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
# .binpath file I/O (pure binary, no header)
# -------------------------------------------------------------------

def write_binpath(filepath, steps):
    """Write a .binpath file (pure gzipped varint bytes)."""
    with open(filepath, 'wb') as f:
        f.write(encode_steps(steps))


def read_binpath(filepath):
    """Read a .binpath file. Returns list of step strings."""
    with open(filepath, 'rb') as f:
        return decode_steps(f.read())


def read_binpath_raw(filepath):
    """Read raw compressed bytes from a .binpath file without decoding."""
    with open(filepath, 'rb') as f:
        return f.read()


# -------------------------------------------------------------------
# index.json I/O
# -------------------------------------------------------------------

def write_path_index(paths_dir, entries):
    """Write paths/index.json with version and path metadata.

    Args:
        paths_dir: the paths/ directory
        entries: dict mapping sample_name → list of metadata dicts
                 each dict has: file, full_id, contig, start, length, is_ref
    """
    index = {
        "version": __version__,
        "paths": entries,
    }
    with open(os.path.join(paths_dir, INDEX_FILENAME), 'w') as f:
        json.dump(index, f, separators=(',', ':'))


def read_path_index(paths_dir):
    """Read paths/index.json. Returns the full index dict."""
    with open(os.path.join(paths_dir, INDEX_FILENAME), 'r') as f:
        return json.load(f)


def path_index_version(paths_dir):
    """Read just the version from index.json, or None if missing."""
    index_path = os.path.join(paths_dir, INDEX_FILENAME)
    if not os.path.exists(index_path):
        return None
    try:
        with open(index_path, 'r') as f:
            data = json.load(f)
        return data.get("version")
    except (json.JSONDecodeError, OSError):
        return None


# -------------------------------------------------------------------
# Legacy format support (for migration)
# -------------------------------------------------------------------

def read_legacy_binpath(filepath):
    """Read old-format .binpath (header + payload). Returns (metadata, steps)."""
    import struct
    with open(filepath, 'rb') as f:
        header_len = struct.unpack('<I', f.read(4))[0]
        header_bytes = f.read(header_len)
        payload = f.read()

    metadata = json.loads(header_bytes.decode('utf-8'))
    steps = decode_steps(payload)
    return metadata, steps


def is_legacy_binpath(filepath):
    """Check if a .binpath file uses the old header format."""
    import struct
    try:
        with open(filepath, 'rb') as f:
            header_len = struct.unpack('<I', f.read(4))[0]
            # Old format: header_len is a small number (JSON size)
            # New format: first 4 bytes are gzip magic (0x1f8b) or varint data
            # If header_len looks like valid JSON size (< 10KB), it's legacy
            if header_len > 10000:
                return False
            header_bytes = f.read(header_len)
            json.loads(header_bytes.decode('utf-8'))
            return True
    except (struct.error, json.JSONDecodeError, UnicodeDecodeError, OSError):
        return False
