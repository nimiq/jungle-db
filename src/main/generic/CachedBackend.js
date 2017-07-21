/**
 * @implements {IObjectStore}
 */
class CachedBackend {
    /**
     * @param {IObjectStore} backend
     */
    constructor(backend) {
        this._backend = backend;
        /** @type {Map.<string,*>} */
        this._cache = new LRUMap(CachedBackend.MAX_CACHE_SIZE);
    }

    /**
     * @type {Map.<string,IIndex>}
     */
    get indices() {
        return this._backend.indices;
    }

    /**
     * @param {Set.<string>} keys
     * @returns {Promise.<Array.<*>>}
     * @protected
     */
    async _retrieveValues(keys) {
        const values = [];
        for (const key of keys) {
            values.push(await this.get(key));
        }
        return values;
    }

    /**
     * @param {string} key
     * @returns {Promise.<*>}
     */
    async get(key) {
        if (this._cache.has(key)) {
            return this._cache.get(key);
        }
        const value = await this._backend.get(key);
        this._cache.set(key, value);
        return value;
    }

    /**
     * @param {string} key
     * @param {*} value
     * @returns {Promise}
     */
    put(key, value) {
        this._cache.set(key, value);
        return this._backend.put(key, value);
    }

    /**
     * @param {string} key
     * @returns {Promise}
     */
    remove(key) {
        this._cache.delete(key);
        return this._backend.remove(key);
    }

    /**
     * @param {Query|KeyRange} [query]
     * @returns {Promise.<Array.<string>>}
     */
    keys(query=null) {
        return this._backend.keys(query);
    }

    /**
     * @param {Query|KeyRange} [query]
     * @returns {Promise.<Array.<*>>}
     */
    values(query=null) {
        const keys = this.keys(query);
        return this._retrieveValues(keys);
    }

    /**
     * @abstract
     * @param {KeyRange|*} [query]
     * @returns {Promise.<*>}
     */
    maxValue(query=null) {
        const key = this.maxKey(query);
        return this.get(key);
    }

    /**
     * @param {KeyRange|*} [query]
     * @returns {Promise.<string>>}
     */
    maxKey(query=null) {
        return this._backend.maxKey(query);
    }

    /**
     * @param {KeyRange|*} [query]
     * @returns {Promise.<string>>}
     */
    minKey(query=null) {
        return this._backend.minKey(query);
    }

    /**
     * @param {KeyRange|*} [query]
     * @returns {Promise.<*>}
     */
    minValue(query=null) {
        const key = this.minKey(query);
        return this.get(key);
    }

    /**
     * @param {KeyRange|*} [query]
     * @returns {Promise.<Array.<string>>}
     */
    count(query=null) {
        return this._backend.count(query);
    }

    /**
     * @param {Transaction} [tx]
     * @returns {Promise.<boolean>}
     */
    async commit(tx) {
        throw 'Unsupported operation';
    }

    /**
     * @param {Transaction} [tx]
     */
    async abort(tx) {
        throw 'Unsupported operation';
    }

    /**
     * @param {Transaction} tx
     * @returns {Promise.<boolean>}
     * @protected
     */
    async _apply(tx) {
        // Update local state and push to backend for batch transaction.
        for (const key of tx._removed) {
            this._cache.delete(key);
        }
        for (const [key, value] of tx._modified) {
            this._cache.set(key, value);
        }
        this._backend._apply(tx);
    }

    /**
     * @param {string} indexName
     * @returns {IIndex}
     */
    index(indexName) {
        return this._backend.index(indexName);
    }

    /**
     * @param {string} indexName
     * @param {string|Array.<string>} [keyPath]
     * @param {boolean} [multiEntry]
     */
    createIndex(indexName, keyPath, multiEntry=false) {
        return this._backend.createIndex(indexName, keyPath, multiEntry);
    }
}
CachedBackend.MAX_CACHE_SIZE = 5000 /*elements*/;
Class.register(CachedBackend);
