/* Bounded caches for parsed map data. Byte counts are conservative estimates, not heap measurements. */
(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MapMemory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';
    function estimateBytes(value) {
        function visit(item, depth) {
            if (item == null) return 8;
            if (typeof item === 'string') return 24 + item.length * 2;
            if (typeof item !== 'object') return 8;
            if (depth > 64) return Number.MAX_SAFE_INTEGER;
            let bytes = Array.isArray(item) ? 32 + item.length * 8 : 48;
            if (Array.isArray(item)) {
                for (let i = 0; i < item.length; i++) bytes += visit(item[i], depth + 1);
            } else {
                for (const key of Object.keys(item)) bytes += 16 + key.length * 2 + visit(item[key], depth + 1);
            }
            return bytes;
        }
        return visit(value, 0);
    }
    class BudgetCache {
        constructor({ maxBytes, maxEntries = Infinity, weigh = estimateBytes }) {
            this.maxBytes = maxBytes; this.maxEntries = maxEntries; this.weigh = weigh;
            this.entries = new Map(); this.bytes = 0;
        }
        get size() { return this.entries.size; }
        has(key) { return this.entries.has(key); }
        get(key) {
            const entry = this.entries.get(key);
            if (!entry) return undefined;
            this.entries.delete(key); this.entries.set(key, entry);
            return entry.value;
        }
        set(key, value) {
            this.delete(key);
            const bytes = this.weigh(value) + String(key).length * 2 + 64;
            if (bytes > this.maxBytes) return this;
            this.entries.set(key, { value, bytes }); this.bytes += bytes;
            while (this.bytes > this.maxBytes || this.size > this.maxEntries) this.delete(this.entries.keys().next().value);
            return this;
        }
        delete(key) {
            const entry = this.entries.get(key);
            if (!entry) return false;
            this.bytes -= entry.bytes; this.entries.delete(key); return true;
        }
        clear() { this.entries.clear(); this.bytes = 0; }
        keys() { return this.entries.keys(); }
        stats() { return { entries:this.size, estimatedBytes:this.bytes, maxBytes:this.maxBytes }; }
    }
    // Only one structured clone is sent to the Worker at a time. Queued snapshots
    // of the same country or hierarchy are replaced by the latest request.
    class LatestJobQueue {
        constructor({ send, drop, maxQueued = 6, cancelActive = null, staleAfterMs = 1500,
            schedule = setTimeout, unschedule = clearTimeout, now = Date.now }) {
            this.send = send; this.drop = drop; this.maxQueued = maxQueued;
            this.cancelActive = cancelActive; this.staleAfterMs = staleAfterMs;
            this.schedule = schedule; this.unschedule = unschedule; this.now = now;
            this.active = null; this.activeGroup = null; this.waiting = new Map(); this.cancelTimer = null;
        }
        enqueue(job, group) {
            if (this.active?.key === job.key) return;
            const previous = this.waiting.get(group);
            if (previous) { this.waiting.delete(group); this.drop(previous); }
            this.waiting.set(group, job);
            while (this.waiting.size > this.maxQueued) {
                const first = this.waiting.keys().next().value;
                const dropped = this.waiting.get(first); this.waiting.delete(first); this.drop(dropped);
            }
            this.pump();
            if (this.cancelActive && this.active && this.waiting.has(this.activeGroup) && this.cancelTimer === null) {
                this.cancelTimer = this.schedule(() => {
                    this.cancelTimer = null;
                    if (!this.active || !this.waiting.has(this.activeGroup)) return;
                    const stale = this.active;
                    try { this.cancelActive(stale); } catch (_) { /* send failures release remaining jobs below */ }
                    this.active = null; this.activeGroup = null; this.drop(stale); this.pump();
                }, Math.max(0, this.staleAfterMs - (this.now() - this.startedAt)));
            }
        }
        pump() {
            if (this.active || !this.waiting.size) return;
            const group = this.waiting.keys().next().value;
            this.active = this.waiting.get(group); this.waiting.delete(group);
            this.activeGroup = group; this.startedAt = this.now();
            try { this.send(this.active); }
            catch (_) { const failed = this.active; this.active = null; this.drop(failed); this.pump(); }
        }
        clearTimer() { if (this.cancelTimer !== null) { this.unschedule(this.cancelTimer); this.cancelTimer = null; } }
        complete(key) { if (this.active?.key === key) { this.clearTimer(); this.active = null; this.activeGroup = null; this.pump(); } }
        clear() {
            this.clearTimer();
            const jobs = [this.active, ...this.waiting.values()].filter(Boolean);
            this.active = null; this.activeGroup = null; this.waiting.clear(); jobs.forEach(job => this.drop(job));
        }
        stats() { return { active:this.active ? 1 : 0, queued:this.waiting.size, maxQueued:this.maxQueued }; }
    }
    class TileResidency {
        constructor({ maxBytes, maxTiles }) { this.maxBytes = maxBytes; this.maxTiles = maxTiles; this.tiles = new Map(); this.bytes = 0; }
        track(filename, features, bytes = estimateBytes(features)) {
            this.remove(filename);
            const ids = new Set(features.map(f => String(f.properties?._id?.$oid || f.properties?._id || f.properties?.id || f.id || '')).filter(Boolean));
            this.tiles.set(filename, { ids, bytes, features }); this.bytes += bytes;
        }
        touch(filename) { const tile = this.tiles.get(filename); if (tile) { this.tiles.delete(filename); this.tiles.set(filename, tile); } }
        remove(filename) { const tile = this.tiles.get(filename); if (tile) { this.tiles.delete(filename); this.bytes -= tile.bytes; } }
        prune(required, pinnedIds = new Set()) {
            const removed = [];
            for (const [filename, tile] of this.tiles) {
                if (this.bytes <= this.maxBytes && this.tiles.size <= this.maxTiles) break;
                if (required.has(filename) || [...tile.ids].some(id => pinnedIds.has(id))) continue;
                this.remove(filename); removed.push(filename);
            }
            return removed;
        }
        retainedIds() { const ids = new Set(); for (const tile of this.tiles.values()) for (const id of tile.ids) ids.add(id); return ids; }
        retainedFeatures() {
            const features = new Map();
            for (const tile of this.tiles.values()) for (const feature of tile.features) {
                const id = String(feature.properties?._id?.$oid || feature.properties?._id || feature.properties?.id || feature.id || '');
                if (id) features.set(id, feature);
            }
            return features;
        }
        clear() { this.tiles.clear(); this.bytes = 0; }
        stats() { return { tiles:this.tiles.size, estimatedBytes:this.bytes, maxBytes:this.maxBytes }; }
    }
    // Streaming hash avoids temporarily stringifying an entire detailed polygon.
    function geometryHash(geometry) {
        let hash = 2166136261;
        function text(value) { for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); } }
        function visit(value) {
            if (Array.isArray(value)) { text('['); for (const child of value) { visit(child); text(','); } text(']'); }
            else text(String(value));
        }
        text(geometry?.type || 'null'); visit(geometry?.coordinates || []);
        return (hash >>> 0).toString(36);
    }
    return { estimateBytes, BudgetCache, LatestJobQueue, TileResidency, geometryHash };
});
