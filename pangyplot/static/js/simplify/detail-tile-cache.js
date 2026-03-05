// Tile cache for bp-space detail tiles.
// Tiles are fixed-width in bp-space, keyed by (zoomBand, tileIndex).
// Zoom band changes invalidate all tiles; panning reuses cached tiles.

const HYSTERESIS = 0.26;   // ~20% of a log2 band (log2(1.2) ≈ 0.26)
const ZOOM_BAND_K = 1e6;   // ppbp * K before log2
const EVICT_DISTANCE = 2;  // keep tiles within this many tile-widths of viewport
const MAX_TILES = 12;
const MIN_TILE_WIDTH = 1024; // bp — tiles smaller than this make no sense

export class TileCache {
    constructor() {
        /** @type {Map<number, { data: Object, fetchedAt: number }>} */
        this.tiles = new Map();
        this.zoomBand = null;
        this.tileWidth = 0;
    }

    /**
     * Quantized zoom level with hysteresis to prevent oscillation.
     * @param {number} ppbp  Pixels per basepair
     * @returns {number}     Integer zoom band
     */
    computeZoomBand(ppbp) {
        const raw = Math.log2(ppbp * ZOOM_BAND_K);
        const newBand = Math.floor(raw);

        if (this.zoomBand === null) return newBand;
        if (newBand === this.zoomBand) return this.zoomBand;

        // Require crossing the boundary plus hysteresis margin
        if (newBand > this.zoomBand) {
            return raw >= this.zoomBand + 1 + HYSTERESIS ? newBand : this.zoomBand;
        }
        return raw < this.zoomBand - HYSTERESIS ? newBand : this.zoomBand;
    }

    /**
     * Tile width: ~5 tiles across viewport, quantized to power of 2.
     * @param {number} viewportBpSpan  Viewport width in basepairs
     * @returns {number}               Tile width in basepairs
     */
    computeTileWidth(viewportBpSpan) {
        const raw = viewportBpSpan / 5;
        const quantized = Math.pow(2, Math.floor(Math.log2(Math.max(1, raw))));
        return Math.max(MIN_TILE_WIDTH, quantized);
    }

    /**
     * Update zoom band and tile width. Returns true if tiles were invalidated.
     * @param {number} ppbp
     * @param {number} viewportBpSpan
     * @returns {boolean}
     */
    update(ppbp, viewportBpSpan) {
        const newBand = this.computeZoomBand(ppbp);

        if (newBand !== this.zoomBand) {
            // Zoom band changed — recompute tile width and invalidate
            this.invalidateAll();
            this.zoomBand = newBand;
            this.tileWidth = this.computeTileWidth(viewportBpSpan);
            return true;
        }
        // First call: set tile width without invalidating
        if (!this.tileWidth) {
            this.tileWidth = this.computeTileWidth(viewportBpSpan);
        }
        return false;
    }

    /**
     * Tile indices that cover [bpStart, bpEnd] plus a margin.
     * @param {number} bpStart
     * @param {number} bpEnd
     * @param {number} margin  Extra bp on each side
     * @returns {number[]}
     */
    getVisibleTileIndices(bpStart, bpEnd, margin) {
        if (!this.tileWidth) return [];
        const first = Math.floor(Math.max(0, bpStart - margin) / this.tileWidth);
        const last = Math.floor((bpEnd + margin) / this.tileWidth);
        const indices = [];
        for (let i = first; i <= last; i++) indices.push(i);
        return indices;
    }

    /**
     * Tile indices not yet in the cache.
     * @param {number[]} visibleIndices
     * @returns {number[]}
     */
    getMissingTiles(visibleIndices) {
        return visibleIndices.filter(i => !this.tiles.has(i));
    }

    setTile(index, data) {
        this.tiles.set(index, { data, fetchedAt: performance.now() });
    }

    getTile(index) {
        const entry = this.tiles.get(index);
        return entry ? entry.data : null;
    }

    invalidateAll() {
        this.tiles.clear();
    }

    /**
     * Evict tiles far from the visible range.
     * @param {number[]} visibleIndices
     * @returns {number[]}  Evicted tile indices
     */
    evictFarTiles(visibleIndices) {
        if (visibleIndices.length === 0) return [];
        const minVis = Math.min(...visibleIndices);
        const maxVis = Math.max(...visibleIndices);

        const evicted = [];
        for (const idx of this.tiles.keys()) {
            if (idx < minVis - EVICT_DISTANCE || idx > maxVis + EVICT_DISTANCE) {
                evicted.push(idx);
            }
        }

        // Also enforce max tile count (evict oldest beyond limit)
        if (this.tiles.size - evicted.length > MAX_TILES) {
            const sorted = [...this.tiles.entries()]
                .filter(([idx]) => !evicted.includes(idx))
                .sort((a, b) => a[1].fetchedAt - b[1].fetchedAt);
            while (this.tiles.size - evicted.length > MAX_TILES && sorted.length) {
                evicted.push(sorted.shift()[0]);
            }
        }

        for (const idx of evicted) this.tiles.delete(idx);
        return evicted;
    }

    get size() {
        return this.tiles.size;
    }
}
