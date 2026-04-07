/**
 * Delta-zigzag-varint decoder for compressed path data (.binpath payload).
 *
 * Encoding: each step "ID+/-" is combined as (segment_id << 1) | dir_bit
 * where + = 0, - = 1. First value is varint-encoded directly; subsequent
 * values are delta-zigzag-varint encoded against the previous combined value.
 *
 * The input is the raw varint stream (already decompressed from gzip).
 */

// -------------------------------------------------------------------
// Varint
// -------------------------------------------------------------------

/**
 * Read an unsigned varint from a Uint8Array at the given offset.
 * @param {Uint8Array} data
 * @param {number} offset
 * @returns {{ value: number, offset: number }}
 */
function readVarint(data, offset) {
    let result = 0;
    let shift = 0;
    while (true) {
        const b = data[offset];
        result |= (b & 0x7F) << shift;
        offset++;
        if (!(b & 0x80)) break;
        shift += 7;
    }
    return { value: result, offset };
}

/**
 * Append an unsigned varint to a byte array.
 * @param {number[]} buf - mutable array of bytes
 * @param {number} value
 */
function writeVarint(buf, value) {
    while (value > 0x7F) {
        buf.push((value & 0x7F) | 0x80);
        value >>>= 7;
    }
    buf.push(value & 0x7F);
}

// -------------------------------------------------------------------
// Zigzag
// -------------------------------------------------------------------

function zigzagDecode(n) {
    return (n >>> 1) ^ -(n & 1);
}

function zigzagEncode(n) {
    return (n << 1) ^ (n >> 31);
}

// -------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------

/**
 * Decode a varint stream into an array of { segId, direction } objects.
 * @param {Uint8Array} data — raw varint bytes (decompressed from gzip)
 * @returns {Array<{ segId: number, direction: string }>}
 */
export function decodeSteps(data) {
    if (!data || data.length === 0) return [];

    const steps = [];
    let offset = 0;
    let prev = 0;
    let first = true;

    while (offset < data.length) {
        const r = readVarint(data, offset);
        offset = r.offset;

        let combined;
        if (first) {
            combined = r.value;
            first = false;
        } else {
            const delta = zigzagDecode(r.value);
            combined = prev + delta;
        }

        steps.push({
            segId: combined >> 1,
            direction: (combined & 1) === 0 ? '+' : '-',
        });
        prev = combined;
    }

    return steps;
}

/**
 * Encode an array of { segId, direction } objects into a varint byte stream.
 * @param {Array<{ segId: number, direction: string }>} steps
 * @returns {Uint8Array}
 */
export function encodeSteps(steps) {
    if (!steps || steps.length === 0) return new Uint8Array(0);

    const buf = [];
    let prev = 0;

    for (let i = 0; i < steps.length; i++) {
        const { segId, direction } = steps[i];
        const combined = (segId << 1) | (direction === '+' ? 0 : 1);

        if (i === 0) {
            writeVarint(buf, combined);
        } else {
            const delta = combined - prev;
            writeVarint(buf, zigzagEncode(delta));
        }
        prev = combined;
    }

    return new Uint8Array(buf);
}
