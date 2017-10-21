/**
 * @implements {IObjectStore}
 */
class DummyBackend {
    constructor(codec=null) {
        this._cache = new Map();

        /** @type {Map.<string,PersistentIndex>} */
        this._indices = new Map();

        this.connected = true;

        this._committed = false;
        this._aborted = false;

        this._codec = codec;

        this._primaryIndex = new JDB.InMemoryIndex(this, undefined, false, true);
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
     * @param {ICodec} [codec]
     * @returns {Promise.<*>}
     */
    async get(key) {
        return this.decode(key, this._cache.get(key));
    }

    /**
     * @param {string} key
     * @param {*} value
     * @param {ICodec} [codec]
     * @returns {Promise}
     */
    async put(key, value) {
        const oldValue = await this.get(key);
        this._cache.set(key, this.encode(value));
        const indexPromises = [
            this._primaryIndex.put(key, value, oldValue)
        ];
        for (const index of this._indices.values()) {
            indexPromises.push(index.put(key, value, oldValue));
        }
        return Promise.all(indexPromises);
    }

    /**
     * @param {string} key
     * @param {ICodec} [codec]
     * @returns {Promise}
     */
    async remove(key) {
        const oldValue = await this.get(key);
        this._cache.delete(key);
        const indexPromises = [
            this._primaryIndex.remove(key, oldValue)
        ];
        for (const index of this._indices.values()) {
            indexPromises.push(index.remove(key, oldValue));
        }
        return Promise.all(indexPromises);
    }

    /**
     * @param {Query|KeyRange} [query]
     * @param {ICodec} [codec]
     * @returns {Promise.<Array.<*>>}
     */
    async values(query=null) {
        if (query !== null && query instanceof JDB.Query) {
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
        if (query !== null && query instanceof JDB.Query) {
            return query.keys(this);
        }
        return this._primaryIndex.keys(query);
    }

    /**
     * @param {KeyRange} [query]
     * @param {ICodec} [codec]
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
    async maxKey(query=null) {
        const keys = await this._primaryIndex.maxKeys(query);
        return Set.sampleElement(keys);
    }

    /**
     * @param {KeyRange} [query]
     * @param {ICodec} [codec]
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
    async minKey(query=null) {
        const keys = await this._primaryIndex.minKeys(query);
        return Set.sampleElement(keys);
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
    createIndex(indexName, keyPath, multiEntry=false) {
        keyPath = keyPath || indexName;
        const index = new JDB.InMemoryIndex(this, keyPath, multiEntry);
        this._indices.set(indexName, index);
    }

    /**
     * Internal method called to decode a single value.
     * @param {string} key The object's primary key.
     * @param {*} value Value to be decoded.
     * @returns {*} The decoded value, either by the object store's default or the overriding decoder if given.
     */
    decode(key, value) {
        if (value === undefined) {
            return undefined;
        }
        if (this._codec !== null && this._codec !== undefined) {
            return this._codec.decode(key, value);
        }
        return value;
    }

    /**
     * Internal method called to encode a single value.
     * @param {*} value Value to be encoded.
     * @returns {*} The encoded value, either by the object store's default or the overriding decoder if given.
     */
    encode(value) {
        if (value === undefined) {
            return undefined;
        }
        if (this._codec !== null && this._codec !== undefined) {
            return this._codec.encode(value);
        }
        return value;
    }

    /**
     * Creates a new transaction, ensuring read isolation
     * on the most recently successfully committed state.
     * @returns {Transaction} The transaction object.
     */
    transaction() {
        throw 'Unsupported operation';
    }
}
JDB.Class.register(DummyBackend);
