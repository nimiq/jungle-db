/**
 * This is a wrapper around the levelup interface for the LMDB.
 * It manages the access to a single table/object store.
 * @implements {IBackend}
 * @implements {ISynchronousObjectStore}
 */
class LMDBBackend {
    /**
     * Creates a wrapper given a JungleDB, the table's name, the database directory and an encoding.
     * @param {JungleDB} db The JungleDB object managing the connection.
     * @param {string} tableName The table name this object store represents.
     * @param {ICodec} [codec] A default codec for the object store.
     * @param {object} [options] Advanced options.
     */
    constructor(db, tableName, codec = null, options = {}) {
        this._db = db;

        this._tableName = tableName;
        /** @type {Map.<string,PersistentIndex>} */
        this._indices = new Map();
        this._indicesToCreate = new Map();
        this._indicesToDelete = [];

        this._codec = codec;
        this._keyEncoding = options && options.keyEncoding ? options.keyEncoding : null;
    }

    /** @type {boolean} */
    get connected() {
        return this._db.connected;
    }

    get _valueEncoding() {
        return this._codec === null ? JungleDB.JSON_ENCODING :
            (this._codec.valueEncoding || this._codec.lmdbValueEncoding || JungleDB.JSON_ENCODING);
    }

    /**
     * Initialises the persisted indices of the object store.
     * @param {number} oldVersion
     * @param {number} newVersion
     * @returns {Array.<PersistentIndex>} The list of indices.
     */
    init(oldVersion, newVersion) {
        this._dbBackend = this._env.openDbi({
            name: this._tableName,
            create: true
        });

        // Delete indices.
        for (const { indexName, upgradeCondition } of this._indicesToDelete) {
            if (upgradeCondition === null || upgradeCondition === true || upgradeCondition(oldVersion, newVersion)) {
                const index = new PersistentIndex(this, indexName, '');
                LMDBBackend.truncate(this._env, index.tableName);
            }
        }
        this._indicesToDelete = [];

        const indices = [];
        for (const [indexName, { index, upgradeCondition }] of this._indicesToCreate) {
            indices.push(index.init(oldVersion, newVersion,
                upgradeCondition === null || upgradeCondition === true || upgradeCondition(oldVersion, newVersion)));
        }
        return indices;
    }

    /**
     * A map of index names to indices.
     * The index names can be used to access an index.
     * @type {Map.<string,IIndex>}
     */
    get indices() {
        return this._indices;
    }

    get _env() {
        return this._db.backend;
    }

    /**
     * Internal method called to decode a single value.
     * @param {*} value Value to be decoded.
     * @param {string} key Key corresponding to the value.
     * @returns {*} The decoded value, either by the object store's default or the overriding decoder if given.
     */
    decode(value, key) {
        if (value === null) { // LMDB returns null if value is not present.
            return undefined;
        }
        value = this._valueEncoding.decode(value);
        if (this._codec !== null && this._codec !== undefined) {
            value = this._codec.decode(value, key);
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
            return null; // LMDB only supports null values
        }
        if (this._codec !== null && this._codec !== undefined) {
            value = this._codec.encode(value);
        }
        value = this._valueEncoding.encode(value);
        return value;
    }

    /**
     * Internal method called to decode a single key.
     * @param {*} key Key to be decoded.
     * @returns {*} The decoded key, either by the object store's default or the overriding decoder if given.
     */
    decodeKey(key) {
        if (key === null || key === undefined) {
            return key;
        }
        if (this._keyEncoding !== null && this._keyEncoding !== undefined) {
            key = this._keyEncoding.decode(key);
        }
        return key;
    }

    /**
     * Internal method called to encode a single key.
     * @param {*} key Key to be encoded.
     * @returns {*} The encoded key, either by the object store's default or the overriding decoder if given.
     */
    encodeKey(key) {
        if (key === null || key === undefined) {
            return null; // LMDB only supports null values
        }
        if (this._keyEncoding !== null && this._keyEncoding !== undefined) {
            key = this._keyEncoding.encode(key);
        }
        return key;
    }

    /**
     * @param txn
     * @param key
     * @returns {*}
     * @protected
     */
    _get(txn, key) {
        switch (this._valueEncoding.encoding) {
            case JungleDB.Encoding.STRING:
                return this.decode(txn.getString(this._dbBackend, this.encodeKey(key)), key);
            case JungleDB.Encoding.NUMBER:
                return this.decode(txn.getNumber(this._dbBackend, this.encodeKey(key)), key);
            case JungleDB.Encoding.BOOLEAN:
                return this.decode(txn.getBoolean(this._dbBackend, this.encodeKey(key)), key);
            case JungleDB.Encoding.BINARY:
                return this.decode(txn.getBinary(this._dbBackend, this.encodeKey(key)), key);
        }
        throw new Error('Invalid encoding given for LMDBBackend');
    }

    /**
     * @param txn
     * @param key
     * @param value
     * @protected
     */
    _put(txn, key, value) {
        value = this.encode(value);
        switch (this._valueEncoding.encoding) {
            case JungleDB.Encoding.STRING:
                return txn.putString(this._dbBackend, this.encodeKey(key), value);
            case JungleDB.Encoding.NUMBER:
                return txn.putNumber(this._dbBackend, this.encodeKey(key), value);
            case JungleDB.Encoding.BOOLEAN:
                return txn.putBoolean(this._dbBackend, this.encodeKey(key), value);
            case JungleDB.Encoding.BINARY:
                return txn.putBinary(this._dbBackend, this.encodeKey(key), value);
        }
        throw new Error('Invalid encoding given for LMDBBackend');
    }

    /**
     * @param txn
     * @param key
     * @protected
     */
    _remove(txn, key) {
        txn.del(this._dbBackend, this.encodeKey(key));
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
     * Inserts or replaces a key-value pair.
     * @param {string} key The primary key to associate the value with.
     * @param {*} value The value to write.
     */
    putSync(key, value) {
        const txn = this._env.beginTxn();
        const oldValue = this._get(txn, key);
        this._put(txn, key, value);

        for (const index of this._indices.values()) {
            index.put(txn, key, value, oldValue);
        }

        txn.commit();
    }

    /**
     * Removes the key-value pair of the given key from the object store.
     * @param {string} key The primary key to delete along with the associated object.
     */
    removeSync(key) {
        const txn = this._env.beginTxn();
        const oldValue = this._get(txn, key);
        this._remove(txn, key);

        for (const index of this._indices.values()) {
            index.remove(txn, key, oldValue);
        }

        txn.commit();
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
    get(key) {
        return Promise.resolve(this.getSync(key));
    }

    /**
     * Inserts or replaces a key-value pair.
     * @param {string} key The primary key to associate the value with.
     * @param {*} value The value to write.
     * @returns {Promise} The promise resolves after writing to the current object store finished.
     */
    put(key, value) {
        this.putSync(key, value);
        return Promise.resolve();
    }

    /**
     * Removes the key-value pair of the given key from the object store.
     * @param {string} key The primary key to delete along with the associated object.
     * @returns {Promise} The promise resolves after writing to the current object store finished.
     */
    async remove(key) {
        this.removeSync(key);
        return Promise.resolve();
    }

    /**
     * @param cursor
     * @param callback
     * @returns {*}
     * @private
     */
    _cursorGetCurrent(cursor, callback) {
        const extendedCallback = (key, value) => {
            key = this.decodeKey(key);
            callback(key, this.decode(value, key));
        };
        switch (this._valueEncoding.encoding) {
            case JungleDB.Encoding.STRING:
                return cursor.getCurrentString(extendedCallback);
            case JungleDB.Encoding.NUMBER:
                return cursor.getCurrentNumber(extendedCallback);
            case JungleDB.Encoding.BOOLEAN:
                return cursor.getCurrentBoolean(extendedCallback);
            case JungleDB.Encoding.BINARY:
                return cursor.getCurrentBinary(extendedCallback);
        }
        throw new Error('Invalid encoding given for LMDBBackend');
    }

    /**
     * Iterates over the keys and values in a given range and direction.
     * The callback is called for each value and primary key fulfilling the query
     * until it returns false and stops the iteration.
     * @param {function(value:*, key:string):boolean} callback A predicate called for each value and key until returning false.
     * @param {boolean} ascending Determines the direction of traversal.
     * @param {KeyRange} query An optional KeyRange to narrow down the iteration space.
     * @param {boolean} keysOnly
     * @protected
     */
    _readStream(callback, ascending = true, query = null, keysOnly = false) {
        const txn = this._env.beginTxn({ readOnly: true });
        const cursor = new lmdb.Cursor(txn, this._dbBackend, {
            keyIsBuffer: this._keyEncoding && this._keyEncoding.encoding === JungleDB.Encoding.BINARY
        });

        // Shortcut for exact match.
        if (query instanceof KeyRange && query.exactMatch) {
            const value = this.getSync(query.lower);
            if (value) {
                callback(value, query.lower);
            }
            cursor.close();
            txn.commit();
            return;
        }

        let currentKey = null;
        // Find lower bound and start from there.
        if (!(query instanceof KeyRange) || (ascending ? query.lower : query.upper) === undefined) {
            currentKey = this.decodeKey(ascending ? cursor.goToFirst() : cursor.goToLast());
        } else {
            // >= lower / >= upper
            currentKey = this.decodeKey(cursor.goToRange(this.encodeKey(ascending ? query.lower : query.upper)));

            // Did not find a key
            if (ascending && currentKey === null) {
                cursor.close();
                txn.commit();
                return;
            }

            // it might be that it is not included because of lower open
            if (!query.includes(currentKey)) {
                currentKey = this.decodeKey(ascending ? cursor.goToNext() : cursor.goToPrev());
            }

            // Did not find a key
            if (!ascending && currentKey === null) {
                cursor.close();
                txn.commit();
                return;
            }
        }

        while (!(query instanceof KeyRange) || query.includes(currentKey)) {
            let currentValue = null;
            if (currentKey === null) {
                break;
            }

            if (keysOnly) {
                currentValue = undefined;
            } else {
                this._cursorGetCurrent(cursor, (key, value) => {
                    currentKey = key;
                    currentValue = value;
                });
            }

            // Only consider return value if not undefined.
            const shouldContinue = callback(currentValue, currentKey);
            if (shouldContinue !== undefined && !shouldContinue) {
                break;
            }

            currentKey = this.decodeKey(ascending ? cursor.goToNext() : cursor.goToPrev());
        }

        cursor.close();
        txn.commit();
        return;
    }

    /**
     * Returns a promise of an array of objects whose primary keys fulfill the given query.
     * If the optional query is not given, it returns all objects in the object store.
     * If the query is of type KeyRange, it returns all objects whose primary keys are within this range.
     * If the query is of type Query, it returns all objects whose primary keys fulfill the query.
     * @param {Query|KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Array.<*>>} A promise of the array of objects relevant to the query.
     */
    values(query=null) {
        if (query !== null && query instanceof Query) {
            return query.values(this);
        }

        let result = [];
        this._readStream((value, key) => {
            result.push(value);
        }, true, query);
        return Promise.resolve(result);
    }

    /**
     * Returns a promise of a set of keys fulfilling the given query.
     * If the optional query is not given, it returns all keys in the object store.
     * If the query is of type KeyRange, it returns all keys of the object store being within this range.
     * If the query is of type Query, it returns all keys fulfilling the query.
     * @param {Query|KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Set.<string>>} A promise of the set of keys relevant to the query.
     */
    keys(query = null) {
        if (query !== null && query instanceof Query) {
            return query.keys(this);
        }
        let resultSet = new Set();
        this._readStream((value, key) => {
            resultSet.add(key);
        }, true, query, true);
        return Promise.resolve(resultSet);
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
        this._readStream((value, key) => {
            return callback(key);
        }, ascending, query, true);
        return Promise.resolve();
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
        this._readStream((value, key) => {
            return callback(value, key);
        }, ascending, query);
        return Promise.resolve();
    }

    /**
     * Returns a promise of the object whose primary key is maximal for the given range.
     * If the optional query is not given, it returns the object whose key is maximal.
     * If the query is of type KeyRange, it returns the object whose primary key is maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<*>} A promise of the object relevant to the query.
     */
    maxValue(query=null) {
        let maxValue = null;
        this._readStream((value, key) => {
            maxValue = value;
            return false;
        }, false, query);
        return Promise.resolve(maxValue);
    }

    /**
     * Returns a promise of the key being maximal for the given range.
     * If the optional query is not given, it returns the maximal key.
     * If the query is of type KeyRange, it returns the key being maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<string>} A promise of the key relevant to the query.
     */
    maxKey(query=null) {
        let maxKey = null;
        this._readStream((value, key) => {
            maxKey = key;
            return false;
        }, false, query, true);
        return Promise.resolve(maxKey);
    }

    /**
     * Returns a promise of the object whose primary key is minimal for the given range.
     * If the optional query is not given, it returns the object whose key is minimal.
     * If the query is of type KeyRange, it returns the object whose primary key is minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<*>} A promise of the object relevant to the query.
     */
    minValue(query=null) {
        let minValue = null;
        this._readStream((value, key) => {
            minValue = value;
            return false;
        }, true, query);
        return Promise.resolve(minValue);
    }

    /**
     * Returns a promise of the key being minimal for the given range.
     * If the optional query is not given, it returns the minimal key.
     * If the query is of type KeyRange, it returns the key being minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<string>} A promise of the key relevant to the query.
     */
    minKey(query=null) {
        let minKey = null;
        this._readStream((value, key) => {
            minKey = key;
            return false;
        }, true, query, true);
        return Promise.resolve(minKey);
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
        return Promise.resolve(i);
    }

    /**
     * The wrapper object stores do not support this functionality
     * as it is managed by the ObjectStore.
     * @param {Transaction} [tx]
     * @returns {Promise.<boolean>}
     */
    async commit(tx) {
        throw new Error('Unsupported operation');
    }

    /**
     * The wrapper object stores do not support this functionality
     * as it is managed by the ObjectStore.
     * @param {Transaction} [tx]
     */
    async abort(tx) {
        throw new Error('Unsupported operation');
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

    /** @type {string} The own table name. */
    get tableName() {
        return this._tableName;
    }

    /**
     * Internally applies a transaction to the store's state.
     * This needs to be done in batch (as a db level transaction), i.e., either the full state is updated
     * or no changes are applied.
     * @param {Transaction} tx The transaction to apply.
     */
    applySync(tx, txn) {
        if (tx._truncated) {
            this._truncate(txn);
        }

        for (const key of tx._removed) {
            this._remove(txn, key);
        }
        for (const [key, value] of tx._modified) {
            this._put(txn, key, value);
        }

        for (const index of this._indices.values()) {
            index.applySync(tx, txn);
        }
    }

    /**
     * Internally applies a transaction to the store's state.
     * This needs to be done in batch (as a db level transaction), i.e., either the full state is updated
     * or no changes are applied.
     * @param {Transaction} tx The transaction to apply.
     * @returns {Promise} The promise resolves after applying the transaction.
     * @protected
     */
    _apply(tx) {
        const txn = this._env.beginTxn();
        this.applySync(tx, txn);
        txn.commit();
        return Promise.resolve();
    }

    /**
     * Returns the necessary information in order to flush a combined transaction.
     * @param {Transaction} tx The transaction that should be applied to this backend.
     * @returns {Promise.<Array>} An array containing the batch operations.
     */
    async applyCombined(tx) {
        return tx;
    }

    /**
     * Truncates a dbi object store.
     * @param db A lmdb instance.
     * @param {string} tableName A table's name.
     * @return {boolean} Whether the table existed or not.
     */
    static truncate(db, tableName) {
        try {
            const dbi = db.openDbi({
                name: tableName
            });
            dbi.drop();
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Empties the object store.
     * @returns {Promise} The promise resolves after emptying the object store.
     */
    truncate() {
        this._dbBackend.drop({
            justFreePages: true
        });
        return Promise.resolve();
    }

    /**
     * Empties the object store.
     * @param txn
     * @protected
     */
    _truncate(txn) {
        this._dbBackend.drop({
            justFreePages: true,
            txn: txn
        });
    }

    /**
     * Fully deletes the object store and its indices.
     * @protected
     */
    _destroy() {
        this._dbBackend.drop();
    }

    /**
     * Fully deletes the object store and its indices.
     * @returns {Promise} The promise resolves after deleting the object store and its indices.
     */
    destroy() {
        this._destroy();
        return Promise.resolve();
    }

    /**
     * Internal method to close the backend's connection.
     * @private
     */
    _close() {
        this._dbBackend.close();
    }

    /**
     * Applies a function on all key-value pairs in the database.
     * @param {function(key:string, value:*)} func The function to apply.
     * @returns {Promise} The promise resolves after applying the function to all entries.
     */
    map(func) {
        this._readStream(func);
        return Promise.resolve();
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
     * @param {{multiEntry:?boolean, upgradeCondition:?boolean|?function(oldVersion:number, newVersion:number):boolean}|boolean} [options] An options object (for deprecated usage: multiEntry boolean).
     */
    createIndex(indexName, keyPath, options=false) {
        let { multiEntry = false, upgradeCondition = null } = (typeof options === 'object' && options !== null) ? options : {};
        if (typeof options !== 'object' && options !== null) multiEntry = options;

        if (this._db.connected) throw new Error('Cannot create index while connected');
        keyPath = keyPath || indexName;
        const index = new PersistentIndex(this, this._db, indexName, keyPath, multiEntry);
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
     * Creates a new transaction, ensuring read isolation
     * on the most recently successfully committed state.
     * @returns {Transaction} The transaction object.
     */
    transaction() {
        throw new Error('Unsupported operation');
    }

    /**
     * Checks whether an object store implements the ISynchronousObjectStore interface.
     * @returns {boolean} The transaction object.
     */
    isSynchronous() {
        return true;
    }
}
Class.register(LMDBBackend);
