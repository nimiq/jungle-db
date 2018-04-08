/**
 * An implementation of a LRU (least recently used) map.
 * This is a map that contains a maximum of k entries,
 * where k is specified in the constructor.
 * When the maximal number of entries is reached,
 * it will evict the least recently used entry.
 * This behaviour is useful for caches.
 * @template K The keys' type.
 * @template V The values' type.
 */
class LRUMap {
    /**
     * Instantiate a LRU map of maximum size maxSize.
     * @param {number} maxSize The maximum size of the map.
     */
    constructor(maxSize) {
        this._maxSize = maxSize;
        /** @type {Map.<K,V>} */
        this._map = new Map();
        /** @type {UniqueLinkedList.<K>} */
        this._accessQueue = new UniqueLinkedList();
    }

    /**
     * The current size of the map.
     * @type {number}
     */
    get size() {
        return this._map.size;
    }

    /**
     * Clears the map.
     */
    clear() {
        this._accessQueue.clear();
        return this._map.clear();
    }

    /**
     * Deletes a key from the map.
     * @param {K} key The key to delete.
     * @returns {boolean} Whether an entry was deleted.
     */
    delete(key) {
        this._accessQueue.remove(key);
        return this._map.delete(key);
    }

    /**
     * Returns an iterator over key value pairs [k, v].
     * @returns {Iterator.<Array>}
     */
    entries() {
        return this._map.entries();
    }

    /**
     * Execute a given function for each key value pair in the map.
     * @param {function(key:K, value:V):*} callback The function to be called.
     * @param {*} [thisArg] This value will be used as this when executing the function.
     */
    forEach(callback, thisArg) {
        return this._map.forEach(callback, thisArg);
    }

    /**
     * Return the corresponding value to a specified key.
     * @param {K} key The key to look for.
     * @returns {V} The value the key maps to (or undefined if not present).
     */
    get(key) {
        this._access(key);
        return this._map.get(key);
    }

    /**
     * Returns true if the specified key is to be found in the map.
     * @param {K} key The key to look for.
     * @returns {boolean} True, if the key is in the map, false otherwise.
     */
    has(key) {
        return this._map.has(key);
    }

    /**
     * Returns an iterator over the keys of the map.
     * @returns {Iterator.<K>}
     */
    keys() {
        return this._map.keys();
    }

    /**
     * Evicts the k least recently used entries from the map.
     * @param {number} [k] The number of entries to evict (default is 1).
     */
    evict(k=1) {
        while (k > 0 && this._accessQueue.length > 0) {
            const oldest = this._accessQueue.shift();
            this._map.delete(oldest);
            --k;
        }
    }

    /**
     * Marks a key as accessed.
     * This implicitly makes the key the most recently used key.
     * @param {K} key The key to mark as accessed.
     * @private
     */
    _access(key) {
        this._accessQueue.remove(key);
        this._accessQueue.push(key);
    }

    /**
     * Inserts or replaces a key's value into the map.
     * If the maxSize of the map is exceeded, the least recently used key is evicted first.
     * Inserting a key implicitly accesses it.
     * @param {K} key The key to set.
     * @param {V} value The associated value.
     */
    set(key, value) {
        if (this.size >= this._maxSize) {
            this.evict();
        }
        if (this.size < this._maxSize) {
            this._map.set(key, value);
            this._access(key);
        }
    }

    /**
     * Returns an iterator over the values of the map.
     * @returns {Iterator.<V>}
     */
    values() {
        return this._map.values();
    }

    /**
     * Returns an iterator over key value pairs [k, v].
     * @returns {Iterator.<Array>}
     */
    [Symbol.iterator]() {
        return this._map.entries();
    }
}
Class.register(LRUMap);
