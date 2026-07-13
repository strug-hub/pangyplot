"""
Generate a pseudo-cytoband from chromosome lengths.

A FASTA .fai gives chromosome names and lengths, which is all the ideogram needs.

Each chromosome is emitted as a single solid band spanning its length. Optional
subdivision (band_size / num_bands) gives a coordinate ruler. No centromere
(acen) is ever emitted -- none of this is real cytogenetic banding.
"""
import os
import re

DEFAULT_MIN_LENGTH = 1_000_000

BAND_STAINS = ("gneg", "gpos50")


def parse_lengths(path):
    """Read (name, length) pairs from a FASTA .fai, or any TSV whose first two
    columns are name and length."""
    lengths = []
    seen = set()

    with open(path, "r") as file:
        for line_num, line in enumerate(file, 1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue

            fields = line.split("\t")
            if len(fields) < 2:
                raise ValueError(
                    f"{path} line {line_num}: expected at least 2 tab-separated "
                    f"columns (name, length), got {len(fields)}"
                )

            name = fields[0]
            try:
                length = int(fields[1])
            except ValueError:
                raise ValueError(
                    f"{path} line {line_num}: non-integer length for '{name}': '{fields[1]}'"
                )

            if length <= 0:
                raise ValueError(
                    f"{path} line {line_num}: sequence '{name}' has non-positive length {length}"
                )
            if name in seen:
                raise ValueError(f"{path} line {line_num}: duplicate sequence name '{name}'")

            seen.add(name)
            lengths.append((name, length))

    if not lengths:
        raise ValueError(f"No sequences found in {path}")

    return lengths


def select_canonical(lengths, min_length=0, chromosomes=None, pattern=None):
    """Pick which sequences belong in the chromosome selector, since a real .fai
    is mostly unplaced scaffolds.

    An explicit chromosomes list also fixes the output order.
    Returns (kept, dropped).
    """
    if chromosomes:
        by_name = dict(lengths)
        missing = [c for c in chromosomes if c not in by_name]
        if missing:
            raise ValueError(
                "requested chromosomes not present in the input: " + ", ".join(missing)
            )
        kept = [(c, by_name[c]) for c in chromosomes]
        dropped = [(n, l) for n, l in lengths if n not in set(chromosomes)]
        return kept, dropped

    regex = re.compile(pattern) if pattern else None

    kept, dropped = [], []
    for name, length in lengths:
        if length < min_length:
            dropped.append((name, length))
        elif regex and not regex.search(name):
            dropped.append((name, length))
        else:
            kept.append((name, length))

    if not kept:
        raise ValueError(
            "no sequences survived filtering -- loosen --min-length, --pattern or --chromosomes"
        )

    return kept, dropped


def generate_bands(name, length, band_size=None, num_bands=None):
    """Band one chromosome, as (chrom, start, end, band_name, stain) tuples.

    Default is a single solid band. If subdivision is requested, band_size wins
    over num_bands, and bands tile [0, length) exactly.
    """
    if band_size is None and num_bands is None:
        return [(name, 0, length, "b1", BAND_STAINS[0])]

    if band_size is None:
        if num_bands < 1:
            raise ValueError("--num-bands must be at least 1")
        # Ceiling division, so num_bands bins cover the whole chromosome.
        band_size = max(1, -(-length // num_bands))

    if band_size < 1:
        raise ValueError("--band-size must be at least 1")

    bands = []
    start = 0
    while start < length:
        end = min(start + band_size, length)
        stain = BAND_STAINS[len(bands) % len(BAND_STAINS)]
        # Never empty: parse_cytoband() substitutes the chromosome name for a blank.
        bands.append((name, start, end, f"b{len(bands) + 1}", stain))
        start = end

    return bands


def write_cytoband(kept, out_dir, genome, band_size=None, num_bands=None):
    """Write {genome}.cytoBand.txt and {genome}.canonical.txt into out_dir.

    Returns (cytoband_path, canonical_path).
    """
    os.makedirs(out_dir, exist_ok=True)

    cytoband_path = os.path.join(out_dir, f"{genome}.cytoBand.txt")
    canonical_path = os.path.join(out_dir, f"{genome}.canonical.txt")

    with open(cytoband_path, "w") as file:
        for name, length in kept:
            for band in generate_bands(name, length, band_size, num_bands):
                file.write("\t".join(str(field) for field in band) + "\n")

    with open(canonical_path, "w") as file:
        for name, _ in kept:
            file.write(f"{name}\n")

    return cytoband_path, canonical_path
