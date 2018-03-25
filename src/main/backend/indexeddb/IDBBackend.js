/**
 * This class is a wrapper around the IndexedDB.
 * It manages the access to a single table/object store.
 * @implements {IBackend}
 */
class IDBBackend {
    /**
     * Creates a wrapper given a JungleDB object and table name.
     * @param {JungleDB} db The JungleDB object managing the connection.
     * @param {string} tableName THe table name this object store represents.
     * @param {ICodec} [codec] Optional codec applied before storing/retrieving values in/from the backend (null is the identity codec).
     */
    constructor(db, tableName, codec=null) {
        this._db = db;
        this._tableName = tableName;
        /** @type {Map.<string,IIndex>} */
        this._indices = new Map();
        this._indicesToCreate = new Map();
        this._indicesToDelete = [];
        this._codec = codec;
    }

    /** @type {boolean} */
    get connected() {
        return this._db.connected;
    }

    /** @type {IDBDatabase} */
    get _backend() {
        if (!this.connected) {
            throw new Error('Requires a connected database');
        }
        return this._db.backend;
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
     * @param {number} oldVersion
     * @param {number} newVersion
     * @protected
     */
    init(objectStore, oldVersion, newVersion) {
        // Delete indices.
        for (const { indexName, upgradeCondition } of this._indicesToDelete) {
            if (upgradeCondition === null || upgradeCondition === true || (typeof upgradeCondition === 'function' && upgradeCondition(oldVersion, newVersion))) {
                objectStore.deleteIndex(indexName);
            }
        }
        this._indicesToDelete = [];

        // Create indices.
        for (const [indexName, { index, upgradeCondition }] of this._indicesToCreate) {
            if (upgradeCondition === null || upgradeCondition === true || (typeof upgradeCondition === 'function' && upgradeCondition(oldVersion, newVersion))) {
                const keyPath = Array.isArray(index.keyPath) ? index.keyPath.join('.') : index.keyPath;
                objectStore.createIndex(indexName, keyPath, {unique: false, multiEntry: index.multiEntry});
            }
        }
        this._indicesToCreate.clear();
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

    /**
     * Returns a promise of the object stored under the given primary key.
     * Resolves to undefined if the key is not present in the object store.
     * @param {string} key The primary key to look for.
     * @returns {Promise.<*>} A promise of the object stored under the given key, or undefined if not present.
     */
    async get(key) {
        const db = this._backend;
        return new Promise((resolve, reject) => {
            const getTx = db.transaction([this._tableName])
                .objectStore(this._tableName)
                .get(key);
            getTx.onsuccess = event => {
                try {
                    resolve(this.decode(event.target.result, key));
                } catch (e) {
                    reject(e);
                }
            };
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
        const db = this._backend;
        return new Promise((resolve, reject) => {
            const putTx = db.transaction([this._tableName], 'readwrite')
                .objectStore(this._tableName)
                .put(this.encode(value), key);
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
        const db = this._backend;
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
     * @returns {Promise.<Array.<*>>} A promise of the array of objects relevant to the query.
     */
    async values(query=null) {
        if (query !== null && query instanceof Query) {
            return query.values(this);
        }
        query = IDBTools.convertKeyRange(query);
        const db = this._backend;
        return new Promise((resolve, reject) => {
            const results = [];
            const openCursorRequest = db.transaction([this._tableName], 'readonly')
                .objectStore(this._tableName)
                .openCursor(query);
            openCursorRequest.onsuccess = event => {
                const cursor = event.target.result;
                if (cursor) {
                    try {
                        results.push(this.decode(cursor.value, cursor.primaryKey));
                    } catch (e) {
                        reject(e);
                    }
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };
            openCursorRequest.onerror = () => reject(openCursorRequest.error);
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
        const db = this._backend;
        return new Promise((resolve, reject) => {
            const results = new Set();
            const store = db.transaction([this._tableName], 'readonly').objectStore(this._tableName);
            const openCursorRequest = store.openKeyCursor ? store.openKeyCursor(query) : store.openCursor(query);
            openCursorRequest.onsuccess = event => {
                const cursor = event.target.result;
                if (cursor) {
                    results.add(cursor.primaryKey);
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };
            openCursorRequest.onerror = () => reject(openCursorRequest.error);
        });
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
        query = IDBTools.convertKeyRange(query);
        const db = this._backend;
        return new Promise((resolve, reject) => {
            const store = db.transaction([this._tableName], 'readonly').objectStore(this._tableName);
            const openCursorRequest = store.openKeyCursor
                ? store.openKeyCursor(query, ascending ? 'next' : 'prev')
                : store.openCursor(query, ascending ? 'next' : 'prev');
            openCursorRequest.onsuccess = event => {
                const cursor = event.target.result;
                if (cursor) {
                    try {
                        if (callback(cursor.primaryKey)) {
                            cursor.continue();
                        } else {
                            resolve();
                        }
                    } catch (e) {
                        reject(e);
                    }
                } else {
                    resolve();
                }
            };
            openCursorRequest.onerror = () => reject(openCursorRequest.error);
        });
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
        query = IDBTools.convertKeyRange(query);
        const db = this._backend;
        return new Promise((resolve, reject) => {
            const openCursorRequest = db.transaction([this._tableName], 'readonly')
                .objectStore(this._tableName)
                .openCursor(query, ascending ? 'next' : 'prev');
            openCursorRequest.onsuccess = event => {
                const cursor = event.target.result;
                if (cursor) {
                    try {
                        if (callback(this.decode(cursor.value, cursor.primaryKey), cursor.primaryKey)) {
                            cursor.continue();
                        } else {
                            resolve();
                        }
                    } catch (e) {
                        reject(e);
                    }
                } else {
                    resolve();
                }
            };
            openCursorRequest.onerror = () => reject(openCursorRequest.error);
        });
    }

    /**
     * Returns a promise of the object whose primary key is maximal for the given range.
     * If the optional query is not given, it returns the object whose key is maximal.
     * If the query is of type KeyRange, it returns the object whose primary key is maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<*>} A promise of the object relevant to the query.
     */
    async maxValue(query=null) {
        query = IDBTools.convertKeyRange(query);
        const db = this._backend;
        return new Promise((resolve, reject) => {
            const openCursorRequest = db.transaction([this._tableName], 'readonly')
                .objectStore(this._tableName)
                .openCursor(query, 'prev');
            openCursorRequest.onsuccess = event => {
                try {
                    const cursor = event.target.result;
                    resolve(cursor ? this.decode(cursor.value, cursor.primaryKey) : undefined);
                } catch (e) {
                    reject(e);
                }
            };
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
        const db = this._backend;
        return new Promise((resolve, reject) => {
            const store = db.transaction([this._tableName], 'readonly').objectStore(this._tableName);
            const openCursorRequest = store.openKeyCursor ? store.openKeyCursor(query, 'prev') : store.openCursor(query, 'prev');
            openCursorRequest.onsuccess = () => resolve(openCursorRequest.result ? openCursorRequest.result.primaryKey : undefined);
            openCursorRequest.onerror = () => reject(openCursorRequest.error);
        });
    }

    /**
     * Returns a promise of the object whose primary key is minimal for the given range.
     * If the optional query is not given, it returns the object whose key is minimal.
     * If the query is of type KeyRange, it returns the object whose primary key is minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<*>} A promise of the object relevant to the query.
     */
    async minValue(query=null) {
        query = IDBTools.convertKeyRange(query);
        const db = this._backend;
        return new Promise((resolve, reject) => {
            const openCursorRequest = db.transaction([this._tableName], 'readonly')
                .objectStore(this._tableName)
                .openCursor(query, 'next');
            openCursorRequest.onsuccess = event => {
                try {
                    const cursor = event.target.result;
                    resolve(cursor ? this.decode(cursor.value, cursor.primaryKey) : undefined);
                } catch (e) {
                    reject(e);
                }
            };
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
        const db = this._backend;
        return new Promise((resolve, reject) => {
            const store = db.transaction([this._tableName], 'readonly').objectStore(this._tableName);
            const openCursorRequest = store.openKeyCursor ? store.openKeyCursor(query, 'next') : store.openCursor(query, 'next');
            openCursorRequest.onsuccess = () => resolve(openCursorRequest.result ? openCursorRequest.result.primaryKey : undefined);
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
        const db = this._backend;
        return new Promise((resolve, reject) => {
            const getRequest = db.transaction([this._tableName], 'readonly')
                .objectStore(this._tableName)
                .count(query);
            getRequest.onsuccess = () => resolve(getRequest.result);
            getRequest.onerror = () => reject(getRequest.error);
        });
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
        const db = this._backend;
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
                objSt.put(this.encode(value), key);
            }

            idbTx.oncomplete = () => resolve(true);
            idbTx.onerror = reject;
            idbTx.onabort = reject;
        });
    }

    /**
     * Empties the object store.
     * @returns {Promise} The promise resolves after emptying the object store.
     */
    async truncate() {
        const db = this._backend;
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
     * @param {{multiEntry:?boolean, upgradeCondition:?boolean|?function(oldVersion:number, newVersion:number):boolean}|boolean} [options] An options object (for deprecated usage: multiEntry boolean).
     */
    createIndex(indexName, keyPath, options=false) {
        let { multiEntry = false, upgradeCondition = null } = (typeof options === 'object' && options !== null) ? options : {};
        if (typeof options !== 'object' && options !== null) multiEntry = options;

        if (this._db.connected) throw new Error('Cannot create index while connected');
        keyPath = keyPath || indexName;
        const index = new PersistentIndex(this, indexName, keyPath, multiEntry);
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
        // Nothing to do here, it is all done on the DB level.
        return this._db.close();
    }

    /**
     * Returns the necessary information in order to flush a combined transaction.
     * @param {Transaction} tx The transaction that should be applied to this backend.
     * @returns {Promise.<EncodedTransaction>} A special transaction object bundling all necessary information.
     */
    async applyCombined(tx) {
        const encodedTx = new EncodedTransaction(this._tableName);

        if (tx._truncated) {
            encodedTx.truncate();
        }

        for (const key of tx._removed) {
            encodedTx.remove(key);
        }
        for (const [key, value] of tx._modified) {
            encodedTx.put(key, this.encode(value));
        }
        return encodedTx;
    }

    /**
     * Checks whether an object store implements the ISynchronousObjectStore interface.
     * @returns {boolean} The transaction object.
     */
    isSynchronous() {
        return false;
    }
}
Class.register(IDBBackend);
