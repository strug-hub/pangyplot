// Tile cache for bp-space detail tiles.
// Tiles are fixed-width in bp-space, keyed by (zoomBand, tileIndex).
// Zoom band changes invalidate all tiles; panning reuses cached tiles.

const HYSTERESIS = 0.26;   // ~20% of a log2 band (log2(1.2) ~ 0.26)
const ZOOM_BAND_K = 1e6;   // ppbp * K before log2
const EVICT_DISTANCE = 2;  // keep tiles within this many tile-widths of viewport
const MAX_TILES = 12;
const MIN_TILE_WIDTH = 1024; // bp -- tiles smaller than this make no sense

export class TileCache {
    constructor() {
        /** @type {Map<number, { data: Object, fetchedAt: number }>} */
        this.tiles = new Map();
        this.zoomBand = null;
        this.tileWidth = 0;
    }

    computeZoomBand(ppbp) {
        const raw = Math.log2(ppbp * ZOOM_BAND_K);
        const newBand = Math.floor(raw);

        if (this.zoomBand === null) return newBand;
        if (newBand === this.zoomBand) return this.zoomBand;

        if (newBand > this.zoomBand) {
            return raw >= this.zoomBand + 1 + HYSTERESIS ? newBand : this.zoomBand;
        }
        return raw < this.zoomBand - HYSTERESIS ? newBand : this.zoomBand;
    }

    computeTileWidth(viewportBpSpan) {
        const raw = viewportBpSpan / 5;
        const quantized = Math.pow(2, Math.floor(Math.log2(Math.max(1, raw))));
        return Math.max(MIN_TILE_WIDTH, quantized);
    }

    update(ppbp, viewportBpSpan) {
        const newBand = this.computeZoomBand(ppbp);

        if (newBand !== this.zoomBand) {
            this.invalidateAll();
            this.zoomBand = newBand;
            this.tileWidth = this.computeTileWidth(viewportBpSpan);
            return true;
        }
        if (!this.tileWidth) {
            this.tileWidth = this.computeTileWidth(viewportBpSpan);
        }
        return false;
    }

    getVisibleTileIndices(bpStart, bpEnd, margin) {
        if (!this.tileWidth) return [];
        const first = Math.floor(Math.max(0, bpStart - margin) / this.tileWidth);
        const last = Math.floor((bpEnd + margin) / this.tileWidth);
        const indices = [];
        for (let i = first; i <= last; i++) indices.push(i);
        return indices;
    }

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
