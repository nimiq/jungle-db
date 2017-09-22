/**
 * This class is a wrapper around the IndexedDB.
 * It manages the access to a single table/object store.
 * @implements {IObjectStore}
 */
class IDBBackend {
    /**
     * Creates a wrapper given a JungleDB object and table name.
     * @param {JungleDB} db The JungleDB object managing the connection.
     * @param {string} tableName THe table name this object store represents.
     * @param {function(obj:*):*} [decoder] Optional decoder function for the object store (null is the identity decoder).
     */
    constructor(db, tableName, decoder=null) {
        this._db = db;
        this._tableName = tableName;
        /** @type {Map.<string,IIndex>} */
        this._indices = new Map();
        this._indicesToDelete = [];
        this._decoder = decoder;
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
     * Internal method called by the JungleDB to create the necessary indices during a version upgrade.
     * @param {IDBObjectStore} objectStore The IDBObjectStore object obtained during a version upgrade.
     * @protected
     */
    init(objectStore) {
        // Delete indices.
        for (const indexName of this._indicesToDelete) {
            objectStore.deleteIndex(indexName);
        }
        delete this._indicesToDelete;

        // Create indices.
        for (const [indexName, index] of this._indices) {
            objectStore.createIndex(indexName, index.keyPath, { unique: false, multiEntry: index.multiEntry});
        }
    }

    /**
     * Internal method called to decode a single value.
     * @param {*} value Value to be decoded.
     * @param {function(obj:*):*} [decoder] Optional decoder function overriding the object store's default (null is the identity decoder).
     * @returns {*} The decoded value, either by the object store's default or the overriding decoder if given.
     */
    decode(value, decoder=undefined) {
        if (value === undefined) {
            return undefined;
        }
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

    /**
     * Returns a promise of the object stored under the given primary key.
     * Resolves to undefined if the key is not present in the object store.
     * @param {string} key The primary key to look for.
     * @param {function(obj:*):*} [decoder] Optional decoder function overriding the object store's default (null is the identity decoder).
     * @returns {Promise.<*>} A promise of the object stored under the given key, or undefined if not present.
     */
    async get(key, decoder=undefined) {
        const db = await this._db.backend;
        return new Promise((resolve, reject) => {
            const getTx = db.transaction([this._tableName])
                .objectStore(this._tableName)
                .get(key);
            getTx.onsuccess = event => resolve(this.decode(event.target.result, decoder));
            getTx.onerror = reject;
        });
    }

    /**
     * Inserts or replaces a key-value pair.
     * @param {string} key The primary key to associate the value with.
     * @param {*} value The value to write.
     * @returns {Promise} The promise resolves after writing to the current object store finished.
     */
    async put(key, value) {
        const db = await this._db.backend;
        return new Promise((resolve, reject) => {
            const putTx = db.transaction([this._tableName], 'readwrite')
                .objectStore(this._tableName)
                .put(value, key);
            putTx.onsuccess = event => resolve(event.target.result);
            putTx.onerror = reject;
        });
    }

    /**
     * Removes the key-value pair of the given key from the object store.
     * @param {string} key The primary key to delete along with the associated object.
     * @returns {Promise} The promise resolves after writing to the current object store finished.
     */
    async remove(key) {
        const db = await this._db.backend;
        return new Promise((resolve, reject) => {
            const deleteTx = db.transaction([this._tableName], 'readwrite')
                .objectStore(this._tableName)
                .delete(key);
            deleteTx.onsuccess = event => resolve(event.target.result);
            deleteTx.onerror = reject;
        });
    }

    /**
     * Returns a promise of an array of objects whose primary keys fulfill the given query.
     * If the optional query is not given, it returns all objects in the object store.
     * If the query is of type KeyRange, it returns all objects whose primary keys are within this range.
     * If the query is of type Query, it returns all objects whose primary keys fulfill the query.
     * @param {Query|KeyRange} [query] Optional query to check keys against.
     * @param {function(obj:*):*} [decoder] Optional decoder function overriding the object store's default (null is the identity decoder).
     * @returns {Promise.<Array.<*>>} A promise of the array of objects relevant to the query.
     */
    async values(query=null, decoder=undefined) {
        if (query !== null && query instanceof Query) {
            return query.values(this);
        }
        query = IDBTools.convertKeyRange(query);
        const db = await this._db.backend;
        return new Promise((resolve, reject) => {
            const getRequest = db.transaction([this._tableName], 'readonly')
                .objectStore(this._tableName)
                .getAll(query);
            getRequest.onsuccess = () => resolve(this.decodeArray(getRequest.result, decoder));
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    /**
     * Returns a promise of a set of keys fulfilling the given query.
     * If the optional query is not given, it returns all keys in the object store.
     * If the query is of type KeyRange, it returns all keys of the object store being within this range.
     * If the query is of type Query, it returns all keys fulfilling the query.
     * @param {Query|KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Set.<string>>} A promise of the set of keys relevant to the query.
     */
    async keys(query=null) {
        if (query !== null && query instanceof Query) {
            return query.keys(this);
        }
        query = IDBTools.convertKeyRange(query);
        const db = await this._db.backend;
        return new Promise((resolve, reject) => {
            const getRequest = db.transaction([this._tableName], 'readonly')
                .objectStore(this._tableName)
                .getAllKeys(query);
            getRequest.onsuccess = () => resolve(Set.from(getRequest.result));
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    /**
     * Returns a promise of the object whose primary key is maximal for the given range.
     * If the optional query is not given, it returns the object whose key is maximal.
     * If the query is of type KeyRange, it returns the object whose primary key is maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @param {function(obj:*):*} [decoder] Optional decoder function overriding the object store's default (null is the identity decoder).
     * @returns {Promise.<*>} A promise of the object relevant to the query.
     */
    async maxValue(query=null, decoder=undefined) {
        query = IDBTools.convertKeyRange(query);
        const db = await this._db.backend;
        return new Promise((resolve, reject) => {
            const openCursorRequest = db.transaction([this._tableName], 'readonly')
                .objectStore(this._tableName)
                .openCursor(query, 'prev');
            openCursorRequest.onsuccess = () => resolve(this.decode(openCursorRequest.result.value, decoder));
            openCursorRequest.onerror = () => reject(openCursorRequest.error);
        });
    }

    /**
     * Returns a promise of the key being maximal for the given range.
     * If the optional query is not given, it returns the maximal key.
     * If the query is of type KeyRange, it returns the key being maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<string>} A promise of the key relevant to the query.
     */
    async maxKey(query=null) {
        query = IDBTools.convertKeyRange(query);
        const db = await this._db.backend;
        return new Promise((resolve, reject) => {
            const openCursorRequest = db.transaction([this._tableName], 'readonly')
                .objectStore(this._tableName)
                .openKeyCursor(query, 'prev');
            openCursorRequest.onsuccess = () => resolve(openCursorRequest.result.primaryKey);
            openCursorRequest.onerror = () => reject(openCursorRequest.error);
        });
    }

    /**
     * Returns a promise of the object whose primary key is minimal for the given range.
     * If the optional query is not given, it returns the object whose key is minimal.
     * If the query is of type KeyRange, it returns the object whose primary key is minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @param {function(obj:*):*} [decoder] Optional decoder function overriding the object store's default (null is the identity decoder).
     * @returns {Promise.<*>} A promise of the object relevant to the query.
     */
    async minValue(query=null, decoder=undefined) {
        query = IDBTools.convertKeyRange(query);
        const db = await this._db.backend;
        return new Promise((resolve, reject) => {
            const openCursorRequest = db.transaction([this._tableName], 'readonly')
                .objectStore(this._tableName)
                .openCursor(query, 'next');
            openCursorRequest.onsuccess = () => resolve(this.decode(openCursorRequest.result.value, decoder));
            openCursorRequest.onerror = () => reject(openCursorRequest.error);
        });
    }

    /**
     * Returns a promise of the key being minimal for the given range.
     * If the optional query is not given, it returns the minimal key.
     * If the query is of type KeyRange, it returns the key being minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<string>} A promise of the key relevant to the query.
     */
    async minKey(query=null) {
        query = IDBTools.convertKeyRange(query);
        const db = await this._db.backend;
        return new Promise((resolve, reject) => {
            const openCursorRequest = db.transaction([this._tableName], 'readonly')
                .objectStore(this._tableName)
                .openKeyCursor(query, 'next');
            openCursorRequest.onsuccess = () => resolve(openCursorRequest.result.primaryKey);
            openCursorRequest.onerror = () => reject(openCursorRequest.error);
        });
    }

    /**
     * Returns the count of entries in the given range.
     * If the optional query is not given, it returns the count of entries in the object store.
     * If the query is of type KeyRange, it returns the count of entries within the given range.
     * @param {KeyRange} [query]
     * @returns {Promise.<number>}
     */
    async count(query=null) {
        query = IDBTools.convertKeyRange(query);
        const db = await this._db.backend;
        return new Promise((resolve, reject) => {
            const getRequest = db.transaction([this._tableName], 'readonly')
                .objectStore(this._tableName)
                .count(query);
            getRequest.onsuccess = () => resolve(getRequest.result);
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    /**
     * The wrapper object stores do not support this functionality
     * as it is managed by the ObjectStore.
     * @param {Transaction} [tx]
     * @returns {Promise.<boolean>}
     */
    async commit(tx) {
        throw 'Unsupported operation';
    }

    /**
     * The wrapper object stores do not support this functionality
     * as it is managed by the ObjectStore.
     * @param {Transaction} [tx]
     */
    async abort(tx) {
        throw 'Unsupported operation';
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

    /** @type {Promise.<IDBDatabase>} The underlying IDBDatabase. */
    get backend() {
        return this._db.backend;
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
     * @returns {Promise} The promise resolves after applying the transaction.
     * @protected
     */
    async _apply(tx) {
        const db = await this._db.backend;
        return new Promise((resolve, reject) => {
            const idbTx = db.transaction([this._tableName], 'readwrite');
            const objSt = idbTx.objectStore(this._tableName);

            if (tx._truncated) {
                objSt.clear();
            }
            for (const key of tx._removed) {
                objSt.delete(key);
            }
            for (const [key, value] of tx._modified) {
                objSt.put(value, key);
            }

            idbTx.oncomplete = () => resolve(true);
            idbTx.onerror = reject;
        });
    }

    /**
     * Empties the object store.
     * @returns {Promise} The promise resolves after emptying the object store.
     */
    async truncate() {
        const db = await this._db.backend;
        return new Promise((resolve, reject) => {
            const getRequest = db.transaction([this._tableName], 'readonly')
                .objectStore(this._tableName)
                .clear();
            getRequest.onsuccess = resolve;
            getRequest.onerror = () => reject(getRequest.error);
        });
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
     * @param {boolean} [multiEntry]
     */
    async createIndex(indexName, keyPath, multiEntry=false) {
        if (this._db.connected) throw 'Cannot create index while connected';
        keyPath = keyPath || indexName;
        const index = new PersistentIndex(this, indexName, keyPath, multiEntry);
        this._indices.set(indexName, index);
    }

    /**
     * Deletes a secondary index from the object store.
     * @param indexName
     * @returns {Promise} The promise resolves after deleting the index.
     */
    async deleteIndex(indexName) {
        if (this._db.connected) throw 'Cannot delete index while connected';
        this._indicesToDelete.push(indexName);
    }

    /**
     * Closes the object store and potential connections.
     * @returns {Promise} The promise resolves after closing the object store.
     */
    close() {
        // Nothing to do here, it is all done on the DB level.
        return this._db.close();
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
Class.register(IDBBackend);
