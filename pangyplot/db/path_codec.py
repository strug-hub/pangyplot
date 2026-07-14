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

import numpy as np

from pangyplot.version import __version__

from pangyplot.db.db_utils import GZIP_LEVEL

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


_POW10 = np.power(10, np.arange(19), dtype=np.int64)


def _combine_steps(steps):
    """["1+", "305-"] -> int64 array of (seg_id << 1) | dir_bit.

    Goes through one joined byte buffer rather than touching each step: at
    chromosome scale this runs tens of millions of times, and both int(s[:-1])
    per step (scalar) and np.array(steps, dtype="S") (which converts each Python
    string individually) were more expensive than the arithmetic they fed.
    ",".join is a single C-level concat and frombuffer is a view, so the strings
    are only walked once, by C.
    """
    n = len(steps)
    buf = np.frombuffer(",".join(steps).encode(), dtype=np.uint8)

    # Every step is digits then one orientation byte, so the commas locate
    # everything. Work only in n-sized arrays: routing through the 9 MB byte
    # stream (masking it, selecting from it, np.repeat over it) costs more than
    # the digits are worth -- a handful of passes over n beats one pass over the
    # buffer.
    comma = np.flatnonzero(buf == 0x2C)

    sign_at = np.empty(n, dtype=np.int64)     # index of each step's +/- byte
    sign_at[:n - 1] = comma - 1
    sign_at[n - 1] = buf.size - 1

    starts = np.empty(n, dtype=np.int64)
    starts[0] = 0
    starts[1:] = comma + 1

    ndigits = sign_at - starts

    seg = np.zeros(n, dtype=np.int64)
    for k in range(int(ndigits.max())):       # k-th digit from the right
        live = ndigits > k
        idx = np.where(live, sign_at - 1 - k, 0)
        digit = buf[idx].astype(np.int64) - 0x30
        seg += np.where(live, digit * _POW10[k], 0)

    return (seg << 1) | (buf[sign_at] == 0x2D)        # '-' -> 1, '+' -> 0


def _encode_varints(values):
    """uint64 array -> concatenated LEB128 varints, as one uint8 array."""
    v = values.astype(np.uint64)

    # how many 7-bit groups each value needs (at least one)
    nbytes = np.ones(v.size, dtype=np.int64)
    for k in range(1, 10):
        nbytes += v >= (np.uint64(1) << np.uint64(7 * k))

    ends = np.cumsum(nbytes)
    starts = ends - nbytes
    out = np.zeros(int(ends[-1]), dtype=np.uint8)

    for k in range(10):
        sel = nbytes > k
        if not sel.any():
            break
        group = ((v[sel] >> np.uint64(7 * k)) & np.uint64(0x7F)).astype(np.uint8)
        # continuation bit on every group but the value's last
        more = nbytes[sel] > k + 1
        out[starts[sel] + k] = np.where(more, group | np.uint8(0x80), group)

    return out


def encode_steps(steps):
    """Encode a list of step strings into gzipped delta-zigzag-varint bytes.

    Args:
        steps: list of strings like ["1+", "2+", "305-"]

    Returns:
        bytes — gzip-compressed varint stream

    Vectorized, and byte-for-byte identical to the scalar version it replaced:
    the per-step loop called five functions (_parse_step, _combine,
    _zigzag_encode, _write_varint, bytearray.append) tens of millions of times
    and was 80% of the path-parsing phase. The decode side already worked this
    way; the encoder had simply never been done.
    """
    if not steps:
        return gzip.compress(b'', GZIP_LEVEL, mtime=0)

    combined = _combine_steps(steps)

    # first value raw, the rest as zigzagged deltas
    payload = np.empty(combined.size, dtype=np.int64)
    payload[0] = combined[0]
    if combined.size > 1:
        deltas = combined[1:] - combined[:-1]
        payload[1:] = (deltas << 1) ^ (deltas >> 63)   # zigzag; >> is arithmetic

    buf = _encode_varints(payload)
    # mtime=0: gzip stamps the current time into its header by default, so two
    # identical builds produced different .binpath bytes. That is invisible to
    # readers but it means a datastore cannot be diffed against another, which
    # is exactly how the flat bubble port was validated.
    return gzip.compress(buf.tobytes(), GZIP_LEVEL, mtime=0)


def decode_combined(data):
    """Decode a .binpath payload to an int64 array of combined values.

    combined = (segment_id << 1) | dir_bit, i.e. the on-disk representation
    before it is rendered as "123+" strings. Consumers that only want segment
    ids should use this: decode_steps() builds one Python string per step,
    which on a chromosome-scale graph means tens of millions of allocations.

    Vectorized: bytes are grouped by continuation bit and summed per value
    with add.reduceat, so no Python-level loop runs over the steps.
    """
    raw = np.frombuffer(gzip.decompress(data), dtype=np.uint8)
    if raw.size == 0:
        return np.empty(0, dtype=np.int64)

    is_last = (raw & 0x80) == 0

    # Byte i belongs to value grp[i]; starts[g] is that value's first byte.
    grp = np.empty(raw.size, dtype=np.int64)
    grp[0] = 0
    np.cumsum(is_last[:-1], out=grp[1:])
    starts = np.flatnonzero(np.concatenate(([True], is_last[:-1])))

    shift = 7 * (np.arange(raw.size, dtype=np.int64) - starts[grp])
    contrib = (raw & 0x7F).astype(np.int64) << shift
    values = np.add.reduceat(contrib, starts)

    # First value is written raw; the rest are zigzag deltas.
    deltas = (values >> 1) ^ -(values & 1)
    deltas[0] = values[0]
    return np.cumsum(deltas)


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


def read_binpath_combined(filepath):
    """Read a .binpath file. Returns an int64 array of combined values."""
    with open(filepath, 'rb') as f:
        return decode_combined(f.read())


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
