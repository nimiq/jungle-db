/**
 * Transactions are created by calling the transaction method on an ObjectStore object.
 * Transactions ensure read-isolation.
 * On a given state, only *one* transaction can be committed successfully.
 * Other transactions based on the same state will end up in a conflicted state if committed.
 * Transactions opened after the successful commit of another transaction will be based on the
 * new state and hence can be committed again.
 * @implements {IBackend}
 * @implements {ISynchronousObjectStore}
 */
class InMemoryBackend {
    constructor(tableName, codec=null) {
        this._cache = new Map();

        /** @type {Map.<string,InMemoryIndex>} */
        this._indices = new Map();

        this._primaryIndex = new InMemoryIndex(this, /*keyPath*/ undefined, /*multiEntry*/ false, /*unique*/ true);
        this._tableName = tableName;
        this._codec = codec;
    }

    /** @type {boolean} */
    get connected() {
        return true;
    }

    /**
     * @type {Map.<string,IIndex>}
     */
    get indices() {
        return this._indices;
    }

    /**
     * Returns the object stored under the given primary key.
     * Resolves to undefined if the key is not present in the object store.
     * @param {string} key The primary key to look for.
     * @returns {*} The object stored under the given key, or undefined if not present.
     */
    getSync(key) {
        return this.decode(this._cache.get(key), key);
    }

    /**
     * @param {string} key
     * @returns {Promise.<*>}
     */
    get(key) {
        try {
            return Promise.resolve(this.getSync(key));
        } catch(e) {
            return Promise.reject(e);
        }
    }

    /**
     * Inserts or replaces a key-value pair.
     * @abstract
     * @param {string} key The primary key to associate the value with.
     * @param {*} value The value to write.
     */
    putSync(key, value) {
        const oldValue = this.getSync(key);
        this._cache.set(key, this.encode(value));
        this._primaryIndex.put(key, value, oldValue);

        for (const index of this._indices.values()) {
            index.put(key, value, oldValue);
        }
    }

    /**
     * @param {string} key
     * @param {*} value
     * @returns {Promise}
     */
    put(key, value) {
        this.putSync(key, value);
        return Promise.resolve();
    }

    /**
     * Removes the key-value pair of the given key from the object store.
     * @abstract
     * @param {string} key The primary key to delete along with the associated object.
     */
    removeSync(key) {
        const oldValue = this.getSync(key);
        this._cache.delete(key);
        this._primaryIndex.remove(key, oldValue);

        for (const index of this._indices.values()) {
            index.remove(key, oldValue);
        }
    }

    /**
     * @param {string} key
     * @returns {Promise}
     */
    remove(key) {
        this.removeSync(key);
        return Promise.resolve();
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
        return this._primaryIndex.keys(query);
    }

    /**
     * Iterates over the keys in a given range and direction.
     * The callback is called for each primary key fulfilling the query
     * until it returns false and stops the iteration.
     * @param {function(key:string):boolean} callback A predicate called for each key until returning false.
     * @param {boolean} ascending Determines the direction of traversal.
     * @param {KeyRange} query An optional KeyRange to narrow down the iteration space.
     * @returns {Promise} The promise resolves after all elements have been streamed.
     */
    keyStream(callback, ascending=true, query=null) {
        return this._primaryIndex.keyStream(callback, ascending, query);
    }

    /**
     * Iterates over the keys and values in a given range and direction.
     * The callback is called for each value and primary key fulfilling the query
     * until it returns false and stops the iteration.
     * @param {function(value:*, key:string):boolean} callback A predicate called for each value and key until returning false.
     * @param {boolean} ascending Determines the direction of traversal.
     * @param {KeyRange} query An optional KeyRange to narrow down the iteration space.
     * @returns {Promise} The promise resolves after all elements have been streamed.
     */
    valueStream(callback, ascending=true, query=null) {
        return this._primaryIndex.valueStream(callback, ascending, query);
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
    async maxKey(query=null) {
        const keys = await this._primaryIndex.maxKeys(query);
        return Set.sampleElement(keys);
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

        const originalValues = new Map();

        for (const key of tx._removed) {
            const oldValue = this.getSync(key);
            if (oldValue) {
                originalValues.set(key, oldValue);
            }
            this._cache.delete(key);
        }
        for (const [key, value] of tx._modified) {
            const oldValue = this.getSync(key);
            if (oldValue) {
                originalValues.set(key, oldValue);
            }
            this._cache.set(key, this.encode(value));
        }

        // Update all indices.
        InMemoryBackend._indexApply(this._primaryIndex, tx, originalValues);
        for (const index of this._indices.values()) {
            InMemoryBackend._indexApply(index, tx, originalValues);
        }
    }

    /**
     * @param {InMemoryIndex} index
     * @param {Transaction} tx
     * @param {Map} originalValues
     * @private
     */
    static _indexApply(index, tx, originalValues) {
        if (tx._truncated) {
            index.truncate();
        }

        for (const key of tx._removed) {
            index.remove(key, originalValues.get(key));
        }
        for (const [key, value] of tx._modified) {
            index.put(key, value, originalValues.get(key));
        }
    }

    /**
     * @returns {Promise}
     */
    async truncate() {
        this.truncateSync();
    }

    truncateSync() {
        this._cache.clear();

        // Truncate all indices.
        this._primaryIndex.truncate()
        for (const index of this._indices.values()) {
            index.truncate();
        }
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
     * @param {string} indexName The name of the index.
     * @param {string|Array.<string>} [keyPath] The path to the key within the object. May be an array for multiple levels.
     * @param {{multiEntry:?boolean, upgradeCondition:?boolean|?function(oldVersion:number, newVersion:number):boolean}|boolean} [options] An options object (for deprecated usage: multiEntry boolean).
     */
    createIndex(indexName, keyPath, options=false) {
        let { multiEntry = false, upgradeCondition = null } = (typeof options === 'object' && options !== null) ? options : {};
        if (typeof options !== 'object' && options !== null) multiEntry = options;

        keyPath = keyPath || indexName;
        const index = new InMemoryIndex(this, keyPath, multiEntry);
        this._indices.set(indexName, index);
    }

    /**
     * Deletes a secondary index from the object store.
     * @param indexName
     * @param {{upgradeCondition:?boolean|?function(oldVersion:number, newVersion:number):boolean}} [options]
     */
    deleteIndex(indexName, options={}) {
        let { upgradeCondition = null } = options || {};

        this._indices.delete(indexName);
    }

    /**
     * Internal method called to decode a single value.
     * @param {*} value Value to be decoded.
     * @param {string} key Key corresponding to the value.
     * @returns {*} The decoded value.
     */
    decode(value, key) {
        if (value === undefined) {
            return undefined;
        }
        if (this._codec !== null && this._codec !== undefined) {
            return this._codec.decode(value, key);
        }
        return value;
    }

    /**
     * Internal method called to encode a single value.
     * @param {*} value Value to be encoded.
     * @returns {*} The encoded value.
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

    /** @type {string} The own table name. */
    get tableName() {
        return this._tableName;
    }

    /**
     * Returns the necessary information in order to flush a combined transaction.
     * @param {Transaction} tx The transaction that should be applied to this backend.
     * @returns {Promise.<*|function():Promise>} Either the tableName if this is a native, persistent backend
     * or a function that effectively applies the transaction to non-persistent backends.
     */
    async applyCombined(tx) {
        return () => this._apply(tx);
    }

    /**
     * Checks whether an object store implements the ISynchronousObjectStore interface.
     * @returns {boolean} The transaction object.
     */
    isSynchronous() {
        return true;
    }

    /**
     * A check whether a certain key is cached.
     * @param {string} key The key to check.
     * @return {boolean} A boolean indicating whether the key is already in the cache.
     */
    isCached(key) {
        return true;
    }
}
Class.register(InMemoryBackend);
