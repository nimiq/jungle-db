/**
 * Transactions are created by calling the transaction method on an ObjectStore object.
 * Transactions ensure read-isolation.
 * On a given state, only *one* transaction can be committed successfully.
 * Other transactions based on the same state will end up in a conflicted state if committed.
 * Transactions opened after the successful commit of another transaction will be based on the
 * new state and hence can be committed again.
 * @implements {IObjectStore}
 */
class InMemoryBackend {
    constructor(tableName, decoder=null) {
        this._cache = new Map();

        /** @type {Map.<string,PersistentIndex>} */
        this._indices = new Map();

        this._primaryIndex = new InMemoryIndex(this, undefined, false, true);
        this._tableName = tableName;
        this._decoder = decoder;
    }

    /**
     * @type {Map.<string,IIndex>}
     */
    get indices() {
        return this._indices;
    }

    /**
     * @param {string} key
     * @param {function(obj:*):*} [decoder]
     * @returns {Promise.<*>}
     */
    async get(key, decoder=undefined) {
        return this.decode(this._cache.get(key), decoder);
    }

    /**
     * @param {string} key
     * @param {*} value
     * @returns {Promise}
     */
    async put(key, value) {
        const oldValue = await this.get(key);
        this._cache.set(key, value);
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
     * @param {function(obj:*):*} [decoder]
     * @returns {Promise.<Array.<*>>}
     */
    async values(query=null, decoder=undefined) {
        if (query !== null && query instanceof Query) {
            return query.values(this);
        }
        const values = [];
        for (const key of this.keys(query)) {
            values.push(await this.get(key, decoder));
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
     * @param {KeyRange} [query]
     * @param {function(obj:*):*} [decoder]
     * @returns {Promise.<*>}
     */
    async maxValue(query=null, decoder=undefined) {
        const maxKey = await this.maxKey(query);
        return this.get(maxKey, decoder);
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
     * @param {function(obj:*):*} [decoder]
     * @returns {Promise.<*>}
     */
    async minValue(query=null, decoder=undefined) {
        const minKey = await this.minKey(query);
        return this.get(minKey, decoder);
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
        throw 'Unsupported operation';
    }

    /**
     * @param {Transaction} [tx]
     */
    async abort(tx) {
        throw 'Unsupported operation';
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
        const indexPromises = [
            InMemoryBackend._indexApply(this._primaryIndex, tx)
        ];
        for (const index of this._indices.values()) {
            indexPromises.push(InMemoryBackend._indexApply(index, tx));
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
        const indexPromises = [
            this._primaryIndex.truncate()
        ];
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

    /**
     * Internal method called to decode a single value.
     * @param {*} value Value to be decoded.
     * @param {function(obj:*):*} [decoder] Optional decoder function overriding the object store's default (null is the identity decoder).
     * @returns {*} The decoded value, either by the object store's default or the overriding decoder if given.
     */
    decode(value, decoder=undefined) {
        if (decoder !== undefined) {
            if (decoder === null) {
                return value;
            }
            return decoder(value);
        }
        if (this._decoder !== null && this._decoder !== undefined) {
            return this._decoder(value);
        }
        return value;
    }

    /**
     * Internal method called to decode multiple values.
     * @param {Array.<*>} values Values to be decoded.
     * @param {function(obj:*):*} [decoder] Optional decoder function overriding the object store's default (null is the identity decoder).
     * @returns {Array.<*>} The decoded values, either by the object store's default or the overriding decoder if given.
     */
    decodeArray(values, decoder=undefined) {
        if (!Array.isArray(values)) {
            return this.decode(values, decoder);
        }
        if (decoder !== undefined) {
            if (decoder === null) {
                return values;
            }
            return values.map(decoder);
        }
        if (this._decoder !== null && this._decoder !== undefined) {
            return values.map(this._decoder);
        }
        return values;
    }

    /** @type {string} The own table name. */
    get tableName() {
        return this._tableName;
    }
}
Class.register(InMemoryBackend);
