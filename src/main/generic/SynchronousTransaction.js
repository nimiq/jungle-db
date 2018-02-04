/**
 * Synchronous transactions avoid unnecessary async/await calls by preloading and caching
 * all necessary key-value-pairs.
 *
 * WARNING: If not all required key-value-pairs are preloaded, the results of any call on a synchronous transaction
 * might be wrong. Only use synchronous transactions, if unavoidable.
 * @implements {IObjectStore}
 * @implements {ICommittable}
 * @extends {Transaction}
 */
class SynchronousTransaction extends Transaction {
    /**
     * This constructor should only be called by an ObjectStore object.
     * Our transactions have a watchdog enabled by default,
     * logging a warning after a certain time specified by WATCHDOG_TIMER.
     * This helps to detect unclosed transactions preventing to store the state in
     * the persistent backend.
     * @param {ObjectStore} objectStore The object store this transaction belongs to.
     * @param {IObjectStore} parent The backend on which the transaction is based,
     * i.e., another transaction or the real database.
     * @param {ICommittable} [managingBackend] The object store managing the transactions,
     * i.e., the ObjectStore object.
     * @param {boolean} [enableWatchdog] If this is is set to true (default),
     * a warning will be logged if left open for longer than WATCHDOG_TIMER.
     * @protected
     */
    constructor(objectStore, parent, managingBackend, enableWatchdog=true) {
        super(objectStore, parent, managingBackend, enableWatchdog);
        /** @type {Map.<string,*>} */
        this._cache = new Map();
    }

    /**
     * This method preloads a set of keys and caches them.
     * It can be called as often as needed.
     * @param {Array.<string>} keys The keys to preload.
     * @return {Promise}
     */
    async preload(keys) {
        keys = keys.filter(key => !this.isCached(key));

        const promises = keys.map(key => Transaction.prototype.get.call(this, key));
        const values = await Promise.all(promises);
        for (let i = 0; i < keys.length; ++i) {
            if (values[i]) {
                this._cache.set(keys[i], values[i]);
            }
        }
    }

    /**
     * A check whether a certain key is cached.
     * @param {string} key The key to check.
     * @return {boolean} A boolean indicating whether the key is already in the cache.
     */
    isCached(key) {
        return this._cache.has(key);
    }

    /**
     * @override
     */
    async get(key) {
        // Use cache or ask parent.
        let value = this._cache.get(key);
        if (!value) {
            value = await Transaction.prototype.get.call(this, key);
            this._cache.set(key, value);
        }
        return value;
    }

    /**
     * Internal method to query cache.
     * @param {string} key
     * @param {boolean} [expectPresence]
     * @return {*} The cached value.
     * @private
     */
    _getCached(key, expectPresence=true) {
        // Use cache only if the parent is not synchronous.
        if (this._parent instanceof SynchronousTransaction) {
            return this._parent.getSync(key, expectPresence);
        }

        const value = this._cache.get(key);
        if (expectPresence && !value) {
            throw new Error(`Missing key in cache: ${key}`);
        }
        return value;
    }

    /**
     * Returns a promise of the object stored under the given primary key.
     * Resolves to undefined if the key is not present in the object store.
     * @param {string} key The primary key to look for.
     * @param {boolean} [expectPresence] Method throws an error if key is not present in transaction or cache.
     * @returns {*} The object stored under the given key, or undefined if not present.
     */
    getSync(key, expectPresence=true) {
        // Order is as follows:
        // 1. check if removed,
        // 2. check if modified,
        // 3. check if truncated
        // 4. request from backend
        if (this._removed.has(key)) {
            return undefined;
        }
        if (this._modified.has(key)) {
            return this._modified.get(key);
        }
        if (this._truncated) {
            return undefined;
        }
        return this._getCached(key, expectPresence);
    }

    /**
     * @override
     */
    async put(key, value) {
        throw new Error('Invalid call on SynchronousTransaction');
    }

    /**
     * Inserts or replaces a key-value pair.
     * @param {string} key The primary key to associate the value with.
     * @param {*} value The value to write.
     */
    putSync(key, value) {
        if (this._state !== Transaction.STATE.OPEN) {
            throw new Error('Transaction already closed');
        }

        const oldValue = this.getSync(key, false);

        // Save for indices.
        if (!this._originalValues.has(key)) {
            this._originalValues.set(key, oldValue);
        }

        this._put(key, value, oldValue);
    }

    /**
     * @override
     */
    async remove(key) {
        throw new Error('Invalid call on SynchronousTransaction');
    }

    /**
     * Removes the key-value pair of the given key from the object store.
     * @param {string} key The primary key to delete along with the associated object.
     */
    removeSync(key) {
        if (this._state !== Transaction.STATE.OPEN) {
            throw new Error('Transaction already closed');
        }

        const oldValue = this.getSync(key, false);
        // Save for indices.
        if (!this._originalValues.has(key)) {
            this._originalValues.set(key, oldValue);
        }

        this._remove(key, oldValue);
    }

    /**
     * @override
     */
    async keys(query=null) {
        throw new Error('Invalid call on SynchronousTransaction');
    }

    /**
     * Returns a promise of a set of keys fulfilling the given query.
     * If the optional query is not given, it returns all keys in the object store.
     * If the query is of type KeyRange, it returns all keys of the object store being within this range.
     * If the query is of type Query, it returns all keys fulfilling the query.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Set.<string>} The set of keys relevant to the query.
     */
    keysSync(query=null) {
        if (query !== null && query instanceof Query) {
            throw new Error('Invalid call on SynchronousTransaction');
        }
        let keys = new Set();
        for (const key of this._cache.keys()) {
            if (query === null || query.includes(key)) {
                keys.add(key);
            }
        }
        for (const key of this._modified.keys()) {
            if (query === null || query.includes(key)) {
                keys.add(key);
            }
        }
        return keys;
    }

    /**
     * @override
     */
    async values(query=null) {
        throw new Error('Invalid call on SynchronousTransaction');
    }

    /**
     * Returns a promise of an array of objects whose primary keys fulfill the given query.
     * If the optional query is not given, it returns all objects in the object store.
     * If the query is of type KeyRange, it returns all objects whose primary keys are within this range.
     * If the query is of type Query, it returns all objects whose primary keys fulfill the query.
     * @param {Query|KeyRange} [query] Optional query to check keys against.
     * @returns {Array.<*>} The array of objects relevant to the query.
     */
    valuesSync(query=null) {
        if (query !== null && query instanceof Query) {
            throw new Error('Invalid call on SynchronousTransaction');
        }
        const keys = this.keysSync(query);
        const values = [];
        for (const key of keys) {
            values.push(this.getSync(key, true));
        }
        return values;
    }

    /**
     * @override
     */
    async keyStream(callback, ascending=true, query=null) {
        throw new Error('Invalid call on SynchronousTransaction');
    }

    /**
     * @override
     */
    async valueStream(callback, ascending=true, query=null) {
        throw new Error('Invalid call on SynchronousTransaction');
    }

    /**
     * @override
     */
    async maxValue(query=null) {
        throw new Error('Invalid call on SynchronousTransaction');
    }

    /**
     * Returns a promise of the object whose primary key is maximal for the given range.
     * If the optional query is not given, it returns the object whose key is maximal.
     * If the query is of type KeyRange, it returns the object whose primary key is maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {*} The object relevant to the query.
     */
    maxValueSync(query=null) {
        const maxKey = this.maxKeySync(query);
        return this.getSync(maxKey);
    }

    /**
     * Returns a promise of the key being maximal for the given range.
     * If the optional query is not given, it returns the maximal key.
     * If the query is of type KeyRange, it returns the key being maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<string>} A promise of the key relevant to the query.
     * @override
     */
    async maxKey(query=null) {
        throw new Error('Invalid call on SynchronousTransaction');
    }

    /**
     * Returns a promise of the key being maximal for the given range.
     * If the optional query is not given, it returns the maximal key.
     * If the query is of type KeyRange, it returns the key being maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {string} The key relevant to the query.
     */
    maxKeySync(query=null) {
        // Take underlying maxKey.
        let maxKey = undefined;
        if (!this._truncated) {
            for (const key of this._cache.keys()) {
                // Find better maxKey in modified data.
                if (!this._removed.has(key) && (query === null || query.includes(key)) && (maxKey === undefined || key > maxKey)) {
                    maxKey = key;
                }
            }
        }

        for (const key of this._modified.keys()) {
            // Find better maxKey in modified data.
            if ((query === null || query.includes(key)) && (maxKey === undefined || key > maxKey)) {
                maxKey = key;
            }
        }
        return maxKey;
    }

    /**
     * @override
     */
    async minValue(query=null) {
        throw new Error('Invalid call on SynchronousTransaction');
    }

    /**
     * Returns a promise of the object whose primary key is minimal for the given range.
     * If the optional query is not given, it returns the object whose key is minimal.
     * If the query is of type KeyRange, it returns the object whose primary key is minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {*} The object relevant to the query.
     */
    minValueSync(query=null) {
        const minKey = this.minKeySync(query);
        return this.getSync(minKey, true);
    }

    /**
     * @override
     */
    async minKey(query=null) {
        throw new Error('Invalid call on SynchronousTransaction');
    }

    /**
     * Returns a promise of the key being minimal for the given range.
     * If the optional query is not given, it returns the minimal key.
     * If the query is of type KeyRange, it returns the key being minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {string} The key relevant to the query.
     */
    minKeySync(query=null) {
        // Take underlying minKey.
        let minKey = undefined;
        if (!this._truncated) {
            for (const key of this._cache.keys()) {
                // Find better maxKey in modified data.
                if (!this._removed.has(key) && (query === null || query.includes(key)) && (minKey === undefined || key < minKey)) {
                    minKey = key;
                }
            }
        }

        for (const key of this._modified.keys()) {
            // Find better maxKey in modified data.
            if ((query === null || query.includes(key)) && (minKey === undefined || key < minKey)) {
                minKey = key;
            }
        }
        return minKey;
    }

    /**
     * @override
     */
    async count(query=null) {
        throw new Error('Invalid call on SynchronousTransaction');
    }

    /**
     * @override
     */
    snapshot() {
        throw new Error('Invalid call on SynchronousTransaction');
    }

    /**
     * @override
     */
    async _commitBackend() {
        // Fill original values.
        if (!this._truncated) {
            for (const key of this._modified.keys()) {
                if (this._originalValues.get(key)) continue;
                this._originalValues.set(key, this._getCached(key, false) || await this._parent.get(key));
            }

            for (const key of (new Set(this._removed)).values()) {
                if (this._originalValues.get(key)) continue;
                const value =  this._getCached(key, false) || await this._parent.get(key);
                if (value) {
                    this._originalValues.set(key, value);
                } else {
                    this._removed.delete(key);
                }
            }
        }
        return Transaction.prototype._commitBackend.call(this);
    }
}
Class.register(SynchronousTransaction);
