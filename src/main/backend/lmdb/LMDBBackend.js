/**
 * This is a wrapper around the interface for the LMDB.
 * It manages the access to a single table/object store.
 * @implements {IBackend}
 * @implements {ISynchronousObjectStore}
 */
class LMDBBackend extends LMDBBaseBackend {
    /**
     * Creates a wrapper given a JungleDB, the table's name, the database directory and an encoding.
     * @param {JungleDB} db The JungleDB object managing the connection.
     * @param {string} tableName The table name this object store represents.
     * @param {ICodec} [codec] A default codec for the object store.
     * @param {object} [options] Advanced options.
     */
    constructor(db, tableName, codec = null, options = {}) {
        super(db, tableName, codec, options);

        /** @type {Map.<string,PersistentIndex>} */
        this._indices = new Map();
        this._indicesToCreate = new Map();
        this._indicesToDelete = [];
    }

    /**
     * A map of index names to indices.
     * The index names can be used to access an index.
     * @type {Map.<string,IIndex>}
     */
    get indices() {
        return this._indices;
    }

    /**
     * Initialises the persisted indices of the object store.
     * @param {number} oldVersion
     * @param {number} newVersion
     * @returns {Array.<PersistentIndex>} The list of indices.
     */
    init(oldVersion, newVersion) {
        super.init(oldVersion, newVersion);

        // Delete indices.
        for (const { indexName, upgradeCondition } of this._indicesToDelete) {
            if (upgradeCondition === null || upgradeCondition === true || (typeof upgradeCondition === 'function' && upgradeCondition(oldVersion, newVersion))) {
                const index = new PersistentIndex(this, indexName, '');
                LMDBBaseBackend.truncate(this._env, index.tableName);
            }
        }
        this._indicesToDelete = [];

        const indices = [];
        for (const [indexName, { index, upgradeCondition }] of this._indicesToCreate) {
            indices.push(index.init(oldVersion, newVersion, upgradeCondition));
        }
        return indices;
    }

    /**
     * Returns the object stored under the given primary key.
     * Resolves to undefined if the key is not present in the object store.
     * @param {string} key The primary key to look for.
     * @returns {*} The object stored under the given key, or undefined if not present.
     */
    getSync(key) {
        const txn = this._env.beginTxn({ readOnly: true });
        const value = this._get(txn, key);
        txn.commit();
        return value;
    }

    /**
     * A check whether a certain key is cached.
     * @param {string} key The key to check.
     * @return {boolean} A boolean indicating whether the key is already in the cache.
     */
    isCached(key) {
        return true;
    }

    /**
     * Returns a promise of the object stored under the given primary key.
     * Resolves to undefined if the key is not present in the object store.
     * @param {string} key The primary key to look for.
     * @returns {Promise.<*>} A promise of the object stored under the given key, or undefined if not present.
     */
    async get(key) {
        return this.getSync(key);
    }

    /**
     * Returns a promise of an array of objects whose primary keys fulfill the given query.
     * If the optional query is not given, it returns all objects in the object store.
     * If the query is of type KeyRange, it returns all objects whose primary keys are within this range.
     * If the query is of type Query, it returns all objects whose primary keys fulfill the query.
     * @param {Query|KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Array.<*>>} A promise of the array of objects relevant to the query.
     */
    async values(query=null) {
        if (query !== null && query instanceof Query) {
            return query.values(this);
        }

        let result = [];
        this._readStream((value, key) => {
            result.push(value);
        }, true, query);
        return result;
    }

    /**
     * Returns a promise of a set of keys fulfilling the given query.
     * If the optional query is not given, it returns all keys in the object store.
     * If the query is of type KeyRange, it returns all keys of the object store being within this range.
     * If the query is of type Query, it returns all keys fulfilling the query.
     * @param {Query|KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Set.<string>>} A promise of the set of keys relevant to the query.
     */
    async keys(query = null) {
        if (query !== null && query instanceof Query) {
            return query.keys(this);
        }
        let resultSet = new Set();
        this._readStream((value, key) => {
            resultSet.add(key);
        }, true, query, true);
        return resultSet;
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
    async keyStream(callback, ascending=true, query=null) {
        this._readStream((value, key) => {
            return callback(key);
        }, ascending, query, true);
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
    async valueStream(callback, ascending=true, query=null) {
        this._readStream((value, key) => {
            return callback(value, key);
        }, ascending, query);
    }

    /**
     * Returns a promise of the object whose primary key is maximal for the given range.
     * If the optional query is not given, it returns the object whose key is maximal.
     * If the query is of type KeyRange, it returns the object whose primary key is maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<*>} A promise of the object relevant to the query.
     */
    async maxValue(query=null) {
        let maxValue = null;
        this._readStream((value, key) => {
            maxValue = value;
            return false;
        }, false, query);
        return maxValue;
    }

    /**
     * Returns a promise of the key being maximal for the given range.
     * If the optional query is not given, it returns the maximal key.
     * If the query is of type KeyRange, it returns the key being maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<string>} A promise of the key relevant to the query.
     */
    async maxKey(query=null) {
        let maxKey = null;
        this._readStream((value, key) => {
            maxKey = key;
            return false;
        }, false, query, true);
        return maxKey;
    }

    /**
     * Returns a promise of the object whose primary key is minimal for the given range.
     * If the optional query is not given, it returns the object whose key is minimal.
     * If the query is of type KeyRange, it returns the object whose primary key is minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<*>} A promise of the object relevant to the query.
     */
    async minValue(query=null) {
        let minValue = null;
        this._readStream((value, key) => {
            minValue = value;
            return false;
        }, true, query);
        return minValue;
    }

    /**
     * Returns a promise of the key being minimal for the given range.
     * If the optional query is not given, it returns the minimal key.
     * If the query is of type KeyRange, it returns the key being minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<string>} A promise of the key relevant to the query.
     */
    async minKey(query=null) {
        let minKey = null;
        this._readStream((value, key) => {
            minKey = key;
            return false;
        }, true, query, true);
        return minKey;
    }

    /**
     * Returns the count of entries in the given range.
     * If the optional query is not given, it returns the count of entries in the object store.
     * If the query is of type KeyRange, it returns the count of entries within the given range.
     * @param {KeyRange} [query]
     * @returns {Promise.<number>}
     */
    async count(query=null) {
        let i = 0;
        this._readStream((value, key) => {
            i++;
        }, true, query, true);
        return i;
    }

    /**
     * Returns the index of the given name.
     * If the index does not exist, it returns undefined.
     * @param {string} indexName The name of the requested index.
     * @returns {IIndex} The index associated with the given name.
     */
    index(indexName) {
        return this._indices.get(indexName);
    }

    /**
     * Internally applies a transaction to the store's state.
     * This needs to be done in batch (as a db level transaction), i.e., either the full state is updated
     * or no changes are applied.
     * @param {EncodedLMDBTransaction} tx The transaction to apply.
     * @param txn
     */
    applyEncodedTransaction(tx, txn) {
        if (tx._truncated) {
            this._truncate(txn);
        }

        for (const key of tx._removed) {
            this._remove(txn, key, undefined, true);
        }
        for (const [key, value] of tx._modified) {
            this._put(txn, key, value, undefined, true);
        }

        for (const [indexName, index] of this._indices) {
            index.applyEncodedTransaction(tx.getIndex(indexName), txn);
        }
    }

    /**
     * Encode transaction and estimate the encoded size of a transaction.
     * @param {Transaction} tx The transaction to encode.
     * @returns {EncodedLMDBTransaction}
     */
    encodeTransaction(tx) {
        const encodedTx = new EncodedLMDBTransaction(this);

        if (tx._truncated) {
            encodedTx.truncate();
        }

        for (const key of tx._removed) {
            this._remove(encodedTx, key);
        }
        for (const [key, value] of tx._modified) {
            this._put(encodedTx, key, value);
        }

        for (const [indexName, index] of this._indices) {
            encodedTx.setIndex(indexName, index.encodeTransaction(tx));
        }

        return encodedTx;
    }

    /**
     * Returns the necessary information in order to flush a combined transaction.
     * @param {Transaction} tx The transaction that should be applied to this backend.
     * @returns {Promise.<Array>} An array containing the batch operations.
     */
    async applyCombined(tx) {
        return this.encodeTransaction(tx);
    }

    /**
     * Applies a function on all key-value pairs in the database.
     * @param {function(key:string, value:*)} func The function to apply.
     * @returns {Promise} The promise resolves after applying the function to all entries.
     */
    async map(func) {
        this._readStream(func);
    }

    /**
     * Creates a new secondary index on the object store.
     * Currently, all secondary indices are non-unique.
     * They are defined by a key within the object or alternatively a path through the object to a specific subkey.
     * For example, ['a', 'b'] could be used to use 'key' as the key in the following object:
     * { 'a': { 'b': 'key' } }
     * Secondary indices may be multiEntry, i.e., if the keyPath resolves to an iterable object, each item within can
     * be used to find this entry.
     * If a new object does not possess the key path associated with that index, it is simply ignored.
     *
     * This function may only be called before the database is connected.
     * Moreover, it is only executed on database version updates or on first creation.
     * @param {string} indexName The name of the index.
     * @param {string|Array.<string>} [keyPath] The path to the key within the object. May be an array for multiple levels.
     * @param {{multiEntry:?boolean, unique:?boolean, upgradeCondition:?boolean|?function(oldVersion:number, newVersion:number):boolean}|boolean} [options] An options object (for deprecated usage: multiEntry boolean).
     */
    createIndex(indexName, keyPath, options=false) {
        let { multiEntry = false, upgradeCondition = null, unique = false } = (typeof options === 'object' && options !== null) ? options : {};
        if (typeof options !== 'object' && options !== null) multiEntry = options;

        if (this._db.connected) throw new Error('Cannot create index while connected');
        keyPath = keyPath || indexName;
        const index = new PersistentIndex(this, this._db, indexName, keyPath, multiEntry, unique);
        this._indices.set(indexName, index);
        this._indicesToCreate.set(indexName, { index, upgradeCondition });
    }

    /**
     * Deletes a secondary index from the object store.
     * @param indexName
     * @param {{upgradeCondition:?boolean|?function(oldVersion:number, newVersion:number):boolean}} [options]
     */
    deleteIndex(indexName, options={}) {
        let { upgradeCondition = null } = options || {};

        if (this._db.connected) throw new Error('Cannot delete index while connected');
        this._indicesToDelete.push({ indexName, upgradeCondition });
    }

    /**
     * Closes the object store and potential connections.
     * @returns {Promise} The promise resolves after closing the object store.
     */
    close() {
        this._close();
        const indexPromises = [];
        for (const index of this._indices.values()) {
            indexPromises.close(index.close());
        }
        return Promise.all(indexPromises);
    }

    /**
     * Checks whether an object store implements the ISynchronousObjectStore interface.
     * @returns {boolean} The transaction object.
     */
    isSynchronous() {
        return true;
    }

    /**
     * Internally applies a transaction to the store's state.
     * This needs to be done in batch (as a db level transaction), i.e., either the full state is updated
     * or no changes are applied.
     * @param {Transaction} tx The transaction to apply.
     * @returns {Promise} The promise resolves after applying the transaction.
     * @protected
     */
    async _apply(tx) {
        // Check database size before applying transaction.
        const encodedTx = this.encodeTransaction(tx);
        if (this._db.autoResize) {
            const estimatedSize = encodedTx.byteSize * 2;
            if (this._db.needsResize(estimatedSize)) {
                this._db.doResize(estimatedSize);
            }
        }

        const txn = this._env.beginTxn();
        try {
            this.applyEncodedTransaction(encodedTx, txn);
        } catch (e) {
            txn.abort();
            throw e;
        }
        txn.commit();
    }
}
Class.register(LMDBBackend);
