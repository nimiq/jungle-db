/**
 * @implements {IObjectStore}
 */
class DummyBackend {
    constructor() {
        this._cache = new Map();

        /** @type {Map.<string,PersistentIndex>} */
        this._indices = new Map();

        this.connected = true;

        this._committed = false;
        this._aborted = false;
    }

    get committed() {
        const state = this._committed;
        this._committed = false;
        return state;
    }

    get aborted() {
        const state = this._aborted;
        this._aborted = false;
        return state;
    }

    /**
     * @type {Map.<string,IIndex>}
     */
    get indices() {
        return this._indices;
    }

    /**
     * @param {string} key
     * @returns {Promise.<*>}
     */
    async get(key) {
        return this._cache.get(key);
    }

    /**
     * @param {string} key
     * @param {*} value
     * @returns {Promise}
     */
    async put(key, value) {
        const oldValue = await this.get(key);
        this._cache.set(key, value);
        const indexPromises = [];
        for (const index of this._indices.values()) {
            indexPromises.push(index.put(key, value, oldValue));
        }
        return Promise.all(indexPromises);
    }

    /**
     * @param {string} key
     * @returns {Promise}
     */
    async remove(key) {
        const oldValue = await this.get(key);
        this._cache.delete(key);
        const indexPromises = [];
        for (const index of this._indices.values()) {
            indexPromises.push(index.remove(key, oldValue));
        }
        return Promise.all(indexPromises);
    }

    /**
     * @param {Query|KeyRange} [query]
     * @returns {Promise.<Array.<*>>}
     */
    async values(query=null) {
        if (query !== null && query instanceof Query) {
            return query.values(this);
        }
        const values = [];
        for (const key of this.keys(query)) {
            values.push(await this.get(key));
        }
        return Promise.resolve(values);
    }

    /**
     * @param {Query|KeyRange} [query]
     * @returns {Promise.<Set.<string>>}
     */
    keys(query=null) {
        if (query !== null && query instanceof Query) {
            return query.keys(this);
        }
        const keys = new Set();
        for (const key of this._cache.keys()) {
            if (query === null || query.includes(key)) {
                keys.add(key);
            }
        }
        return Promise.resolve(keys);
    }

    /**
     * @param {KeyRange} [query]
     * @returns {Promise.<*>}
     */
    async maxValue(query=null) {
        const maxKey = await this.maxKey(query);
        return this.get(maxKey);
    }

    /**
     * @param {KeyRange} [query]
     * @returns {Promise.<string>}
     */
    maxKey(query=null) {
        let maxKey = null;
        for (const key of this._cache.keys()) {
            if ((query === null || query.includes(key))
                && (maxKey === null || key > maxKey)) {
                maxKey = key;
            }
        }
        return Promise.resolve(maxKey || undefined);
    }

    /**
     * @param {KeyRange} [query]
     * @returns {Promise.<*>}
     */
    async minValue(query=null) {
        const minKey = await this.minKey(query);
        return this.get(minKey);
    }

    /**
     * @param {KeyRange} [query]
     * @returns {Promise.<string>}
     */
    minKey(query=null) {
        let minKey = null;
        for (const key of this._cache.keys()) {
            if ((query === null || query.includes(key))
                && (minKey === null || key < minKey)) {
                minKey = key;
            }
        }
        return Promise.resolve(minKey || undefined);
    }

    /**
     * @param {KeyRange} [query]
     * @returns {Promise.<number>}
     */
    async count(query=null) {
        return (await this.keys(query)).size;
    }

    /**
     * @param {Transaction} [tx]
     * @returns {Promise.<boolean>}
     */
    async commit(tx) {
        this._committed = true;
    }

    /**
     * @param {Transaction} [tx]
     */
    async abort(tx) {
        this._aborted = true;
    }

    /**
     * @param {string} indexName
     * @returns {IIndex}
     */
    index(indexName) {
        return this._indices.get(indexName);
    }

    /**
     * @param {Transaction} tx
     * @returns {Promise.<boolean>}
     * @protected
     */
    async _apply(tx) {
        if (tx._truncated) {
            await this.truncate();
        }

        for (const key of tx._removed) {
            await this.remove(key);
        }
        for (const [key, value] of tx._modified) {
            await this.put(key, value);
        }

        // Update all indices.
        const indexPromises = [];
        for (const index of this._indices.values()) {
            indexPromises.push(DummyBackend._indexApply(index, tx));
        }
        return Promise.all(indexPromises);
    }

    /**
     * @param {InMemoryIndex} index
     * @param {Transaction} tx
     * @returns {Promise}
     * @private
     */
    static async _indexApply(index, tx) {
        if (tx._truncated) {
            await index.truncate();
        }

        for (const key of tx._removed) {
            await index.remove(key, tx._originalValues.get(key));
        }
        for (const [key, value] of tx._modified) {
            await index.put(key, value, tx._originalValues.get(key));
        }
    }

    /**
     * @returns {Promise}
     */
    async truncate() {
        this._cache.clear();

        // Truncate all indices.
        const indexPromises = [];
        for (const index of this._indices.values()) {
            indexPromises.push(index.truncate());
        }
        return Promise.all(indexPromises);
    }

    /**
     * @param {function(key:string, value:*)} func
     * @returns {Promise}
     */
    async map(func) {
        for (const [key, value] of this._cache) {
            func(key, value);
        }
    }

    /**
     * @param {string} indexName
     * @param {string|Array.<string>} [keyPath]
     * @param {boolean} [multiEntry]
     */
    async createIndex(indexName, keyPath, multiEntry=false) {
        keyPath = keyPath || indexName;
        const index = new InMemoryIndex(this, keyPath, multiEntry);
        this._indices.set(indexName, index);
    }
}
Class.register(DummyBackend);
