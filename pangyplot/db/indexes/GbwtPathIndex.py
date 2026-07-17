"""GBWT-backed path source (GBWT migration Stage 3).

Drop-in for PathIndex, but sourced from the GBWT graphd instead of binpath
files. Groups the graphd's /meta path list into PangyPlot's sample -> [subpath]
shape and serves each subpath's `combined` array via /walk, so region filtering
+ varint encoding (Stage 2) are reused unchanged. Byte-identical to binpaths
(tests/db/test_gbz_parity.py).

Sample keys and per-subpath metadata match the legacy PathIndex exactly for
native builds (test_gbwt_native_build.test_native_metadata_matches_legacy): the
native GBWT carries PangyPlot's sample name verbatim in `sample` (phase 0), so
_sample_key returns it unchanged, and contig/start/length come straight from the
GBWT metadata (bp ranges recomputed from the walk + StepIndex).

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
import json
import os
from collections import defaultdict

import numpy as np

from pangyplot.db.path_codec import encode_combined

# Deliberately NOT paths/bp_ranges.json, which is the binpath engine's cache: a
# chr dir can hold both a paths/ store and a graph.gbz, and an adopted GBZ need
# not walk identically to the binpaths it sits beside. Separate files let the two
# engines cache independently instead of silently overwriting each other.
BP_RANGES_CACHE = "bp_ranges.gbwt.json"


class GbwtPathIndex:
    def __init__(self, client, db_dir=None):
        # db_dir is the chr directory, and is what makes bp-range caching
        # possible; omit it (as the tests do) and compute_bp_ranges just
        # recomputes every time.
        self.client = client
        self.db_dir = db_dir
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
        """PangyPlot sample name from a GBWT path entry.

        Native builds carry the full PangyPlot sample name in `sample` with
        phase 0, so the name is returned verbatim (exact parity with the legacy
        PathIndex keys). Foreign/vg GBZs use real PanSN phases, so a non-zero
        phase is appended (`sample#phase`) to keep haplotypes distinct.
        """
        sample = p.get("sample", "")
        phase = p.get("phase", 0) or 0
        return f"{sample}#{phase}" if phase else sample

    # -- bp ranges --------------------------------------------------------

    def _bp_ranges_cache_path(self):
        return os.path.join(self.db_dir, BP_RANGES_CACHE) if self.db_dir else None

    def _cache_signature(self):
        """What the cache must agree with to be reusable.

        Cheap to compute and enough to catch the cache being read against a
        different graph: the subpath count per sample is what the range lists are
        positionally aligned to, so if either moves the cache is meaningless.
        """
        return {s: len(e) for s, e in self._by_sample.items()}

    def _load_bp_ranges_cache(self):
        path = self._bp_ranges_cache_path()
        if not path or not os.path.exists(path):
            return False
        try:
            with open(path) as f:
                data = json.load(f)
            ranges = data["ranges"]
        except (OSError, json.JSONDecodeError, KeyError, TypeError):
            return False
        # A stale cache is worse than no cache: it silently mislabels every
        # subpath's coordinates. Recompute unless it matches this graph exactly.
        if data.get("signature") != self._cache_signature():
            return False
        self._subpath_bp_ranges = {
            s: [tuple(r) for r in rr] for s, rr in ranges.items()
        }
        return True

    def _save_bp_ranges_cache(self):
        path = self._bp_ranges_cache_path()
        if not path:
            return
        payload = {
            "signature": self._cache_signature(),
            "ranges": {s: [list(r) for r in rr]
                       for s, rr in self._subpath_bp_ranges.items()},
        }
        tmp = f"{path}.tmp"
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(tmp, "w") as f:
                json.dump(payload, f)
            os.replace(tmp, path)   # atomic: a killed server leaves no half-file
        except OSError:
            # A read-only or full datastore costs startup time, not correctness.
            if os.path.exists(tmp):
                try: os.remove(tmp)
                except OSError: pass

    def compute_bp_ranges(self, step_index):
        """Precompute (bp_start, bp_end) per subpath from its walk + StepIndex.

        Same computation as PathIndex.compute_bp_ranges: gather the min/max
        reference bp over the segments a subpath walks that lie on the reference
        path. Guarantees the bp ranges match the binpath engine's exactly (both
        read the identical walk and the identical StepIndex). Called once at
        startup after PathIndex and StepIndex are loaded (app.py).

        Cached to disk, as PathIndex does, because this is the single most
        expensive thing at startup: it walks every subpath of every sample in
        full, and a whole-genome v2 datastore made that ~1 min per chromosome --
        ~25 min of a server start spent recomputing what `add` already computed.
        """
        if self._load_bp_ranges_cache():
            return

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

        self._save_bp_ranges_cache()

    # -- PathIndex-compatible surface -------------------------------------

    def get_samples(self):
        return list(self._by_sample.keys())

    def get_sample_idx(self):
        """sample -> stable colour index, for /pathorder."""
        return self._sample_idx

    def get_path_meta(self, sample):
        """Subpath metadata for a sample (index = position in this list).

        Mirrors the legacy PathIndex meta shape: `contig`, `start` (the subpath's
        genomic start, from the GBWT `fragment`), and `length` (None, as the
        legacy index also stores it -- the frontend labels `contig:start` when it
        is None). bp_start/bp_end are attached by get_path_meta_with_bp.
        """
        out = []
        for p in self._by_sample.get(sample, []):
            out.append({
                "contig": p.get("contig"),
                "start": p.get("fragment"),
                "length": None,
                "phase": p.get("phase"),
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
        """Return the subpath's combined int64 array (via the graphd /walk)."""
        entries = self._by_sample.get(sample, [])
        if file_index < 0 or file_index >= len(entries):
            return None
        return self.client.walk(entries[file_index]["id"])

    def get_path_raw(self, sample, file_index):
        """Whole-subpath gzipped varint bytes (for /path-data without a region).

        Re-encodes the graphd walk with the same codec the frontend decodes, so
        the wire format is identical to the binpath one it replaces.
        """
        combined = self.get_path_combined(sample, file_index)
        if combined is None:
            return None
        return encode_combined(combined)

    def get_paths(self, sample):
        """Iterable Path domain objects, built from the graphd walks.

        The GFA/layout exports (resolve_export_subgraph) consume paths by
        iterating each as (seg_id, strand) and reading sample/hap/contig for the
        P-line name. We reconstruct that from each subpath's walk: the combined
        value is (seg_id << 1) | orient (+ = 0, - = 1), the same codec the binpath
        Path uses, so add_step((seg_id), '+'/'-') yields an identical iteration.

        The sample key already carries the phase (sample#phase, or bare for phase
        0), so split it back into sample/hap to keep the P-line name in the
        `sample#hap#contig` shape the binpath export produces.
        """
        from pangyplot.objects.Path import Path

        key = str(sample)
        base, hap = (key.split("#", 1) + [None])[:2] if "#" in key else (key, None)

        paths = []
        for entry in self._by_sample.get(sample, []):
            combined = self.client.walk(entry["id"])
            p = Path()
            p.sample = base
            p.hap = hap
            p.contig = entry.get("contig")
            p.start = entry.get("fragment", 0) or 0
            for c in combined.tolist():
                p.add_step(c >> 1, '+' if (c & 1) == 0 else '-')
            paths.append(p)
        return paths

    def __len__(self):
        return len(self._by_sample)

    def __repr__(self):
        return f"GbwtPathIndex(samples={len(self._by_sample)}, base={self.client.base_url})"
