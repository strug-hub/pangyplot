"""GBWT-backed path source (GBWT migration Stage 3).

Drop-in for PathIndex, but sourced from the GBWT sidecar instead of binpath
files. Groups the sidecar's /meta path list into PangyPlot's sample -> [subpath]
shape and serves each subpath's `combined` array via /walk, so region filtering
+ varint encoding (Stage 2) are reused unchanged. Byte-identical to binpaths
(tests/db/test_gbz_parity.py).

Sample keying is PanSN-ish (`sample#phase`). It does not affect walk correctness
(validated by set-parity), only how subpaths are grouped/labelled and ordered.

Serving surface covered (the simplify-viewer path seam):
    /samples     -> get_samples
    /path-meta   -> get_path_meta_with_bp   (contig/start/length + bp ranges)
    /path-data   -> get_path_raw / get_path_combined (whole + region-sliced)
    /pathorder   -> get_sample_idx

NOT covered (core-viewer `/path` + `/export`): get_paths(), which returns
iterable Path domain objects with subset_path/serialize. Those consumers are
outside the migration seam; they raise a clear error under GBWT mode until
ported. See context/gbwt-migration.md (Stage 3 wiring).
"""
from collections import defaultdict

import numpy as np

from pangyplot.db.path_codec import encode_combined


class GbwtPathIndex:
    def __init__(self, client):
        self.client = client
        meta = client.meta()
        self.has_translation = meta.get("has_translation", False)
        self._n_nodes = meta.get("nodes", 0)

        # sample key -> ordered list of subpath entries (gbz path id + fields)
        self._by_sample = defaultdict(list)
        for p in meta.get("path_list", []):
            self._by_sample[self._sample_key(p)].append(p)

        # sample key -> stable integer index (frontend colour ordering). Order
        # follows first appearance in the GBWT metadata, mirroring how the
        # legacy sample_idx was assigned in walk order during preprocessing.
        self._sample_idx = {s: i for i, s in enumerate(self._by_sample.keys())}

        # sample key -> [(bp_start, bp_end), ...] aligned to _by_sample order.
        # Filled by compute_bp_ranges once the StepIndex is available.
        self._subpath_bp_ranges = {}

    @staticmethod
    def _sample_key(p):
        """PangyPlot sample name from a GBWT path entry."""
        sample = p.get("sample", "")
        phase = p.get("phase", 0)
        return f"{sample}#{phase}" if phase is not None else sample

    # -- bp ranges --------------------------------------------------------

    def compute_bp_ranges(self, step_index):
        """Precompute (bp_start, bp_end) per subpath from its walk + StepIndex.

        Same computation as PathIndex.compute_bp_ranges: gather the min/max
        reference bp over the segments a subpath walks that lie on the reference
        path. Guarantees the bp ranges match the binpath engine's exactly (both
        read the identical walk and the identical StepIndex). Called once at
        startup after PathIndex and StepIndex are loaded (app.py).
        """
        segments = np.asarray(step_index.segments, dtype=np.int64)
        starts = np.asarray(step_index.starts, dtype=np.int64)
        ends = np.asarray(step_index.ends, dtype=np.int64)

        size = int(segments.max()) + 1 if segments.size else 0
        seg_min = np.full(size, np.iinfo(np.int64).max, dtype=np.int64)
        seg_max = np.full(size, np.iinfo(np.int64).min, dtype=np.int64)
        if size:
            np.minimum.at(seg_min, segments, starts)
            np.maximum.at(seg_max, segments, ends)
        known = seg_min != np.iinfo(np.int64).max

        for sample, entries in self._by_sample.items():
            ranges = []
            for entry in entries:
                combined = self.client.walk(entry["id"])
                seg_ids = combined >> 1
                seg_ids = seg_ids[(seg_ids >= 0) & (seg_ids < size)]
                if seg_ids.size:
                    seg_ids = seg_ids[known[seg_ids]]

                if seg_ids.size == 0:
                    ranges.append((None, None))
                    continue

                ranges.append((int(seg_min[seg_ids].min()),
                               int(seg_max[seg_ids].max())))
            self._subpath_bp_ranges[sample] = ranges

    # -- PathIndex-compatible surface -------------------------------------

    def get_samples(self):
        return list(self._by_sample.keys())

    def get_sample_idx(self):
        """sample -> stable colour index, for /pathorder."""
        return self._sample_idx

    def get_path_meta(self, sample):
        """Subpath metadata for a sample (index = position in this list)."""
        bp_ranges = self._subpath_bp_ranges.get(sample, [])
        out = []
        for i, p in enumerate(self._by_sample.get(sample, [])):
            bp_start, bp_end = bp_ranges[i] if i < len(bp_ranges) else (None, None)
            length = (bp_end - bp_start) if (bp_start is not None
                                             and bp_end is not None) else None
            out.append({
                "contig": p.get("contig"),
                "start": bp_start,
                "length": length,
                "phase": p.get("phase"),
                "fragment": p.get("fragment"),
                "gbz_id": p.get("id"),
            })
        return out

    def get_path_meta_with_bp(self, sample):
        """Metadata for /path-meta with bp_start/bp_end attached."""
        bp_ranges = self._subpath_bp_ranges.get(sample, [])
        meta = self.get_path_meta(sample)
        for i, entry in enumerate(meta):
            if i < len(bp_ranges):
                entry["bp_start"] = bp_ranges[i][0]
                entry["bp_end"] = bp_ranges[i][1]
            else:
                entry["bp_start"] = None
                entry["bp_end"] = None
        return meta

    def get_path_combined(self, sample, file_index):
        """Return the subpath's combined int64 array (via the sidecar /walk)."""
        entries = self._by_sample.get(sample, [])
        if file_index < 0 or file_index >= len(entries):
            return None
        return self.client.walk(entries[file_index]["id"])

    def get_path_raw(self, sample, file_index):
        """Whole-subpath gzipped varint bytes (for /path-data without a region).

        Re-encodes the sidecar walk with the same codec the frontend decodes, so
        the wire format is identical to the binpath one it replaces.
        """
        combined = self.get_path_combined(sample, file_index)
        if combined is None:
            return None
        return encode_combined(combined)

    def get_paths(self, sample):
        """Iterable Path domain objects — NOT yet ported to GBWT.

        Only the core viewer's `/path` and `/export` use this; the simplify
        viewer (the migration seam) does not. Raising keeps the failure explicit
        instead of silently serving wrong data.
        """
        raise NotImplementedError(
            "get_paths() (core-viewer /path, /export) is not supported under the "
            "GBWT path engine yet; use the simplify viewer's /path-data. See "
            "context/gbwt-migration.md."
        )

    def __len__(self):
        return len(self._by_sample)

    def __repr__(self):
        return f"GbwtPathIndex(samples={len(self._by_sample)}, base={self.client.base_url})"
