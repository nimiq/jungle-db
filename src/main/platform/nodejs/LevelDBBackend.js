const levelup = require('levelup');

/**
 * This is a wrapper around the levelup interface for the LevelDB.
 * It manages the access to a single table/object store.
 * @implements {IObjectStore}
 */
class LevelDBBackend {
    /**
     * Creates a wrapper given a JungleDB, the table's name, the database directory and an encoding.
     * @param {JungleDB} db The JungleDB object managing the connection.
     * @param {string} tableName The table name this object store represents.
     * @param {string} databaseDir The directory of the database. The object store is stored in there as a subfolder.
     * @param {{encode:function(), decode:function(), buffer:boolean, type:string}} valueEncoding A levelDB encoding
     * for the values in the database (by default: a slightly optimized JSON encoding).
     */
    constructor(db, tableName, databaseDir, valueEncoding) {
        this._db = db;

        this._databaseDirectory = databaseDir + tableName;
        this._dbBackend = levelup(this._databaseDirectory, {
            keyEncoding: 'ascii',
            valueEncoding: valueEncoding
        });
        this._valueEncoding = valueEncoding;

        this._indexVersion = 0;

        this._tableName = tableName;
        /** @type {Map.<string,PersistentIndex>} */
        this._indices = new Map();
    }

    /**
     * Initialises the persisted indices of the object store.
     * @returns {Promise.<Array.<PersistentIndex>>} The list of indices.
     */
    async init() {
        this._indexVersion = (await this.get('_indexVersion')) || this._indexVersion;
        const indexPromises = [];
        for (const index of this._indices.values()) {
            indexPromises.push(index.init());
        }
        return Promise.all(indexPromises);
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
     * Returns a promise of the object stored under the given primary key.
     * Resolves to undefined if the key is not present in the object store.
     * @param {string} key The primary key to look for.
     * @returns {Promise.<*>} A promise of the object stored under the given key, or undefined if not present.
     */
    async get(key) {
        return new Promise((resolve, error) => {
            this._dbBackend.get(key, (err, value) => {
                if (err) {
                    resolve(undefined);
                    return;
                }
                resolve(value);
            });
        });
    }

    /**
     * Inserts or replaces a key-value pair.
     * @param {string} key The primary key to associate the value with.
     * @param {*} value The value to write.
     * @returns {Promise} The promise resolves after writing to the current object store finished.
     */
    async put(key, value) {
        const oldValue = await this.get(key);
        return new Promise((resolve, error) => {
            const batch = this._dbBackend.batch();

            this._indexVersion = (this._indexVersion + 1) % LevelDBBackend.MAX_INDEX_VERSION;
            batch.put(key, value);
            batch.put('_indexVersion', this._indexVersion);
            batch.write(err => {
                if (err) {
                    error(err);
                    return;
                }

                // Remove from all indices.
                const indexPromises = [];
                for (const index of this._indices.values()) {
                    indexPromises.push(index.put(key, value, oldValue));
                }
                Promise.all(indexPromises).then(() => {
                    resolve();
                }).catch(error);
            });
        });
    }

    /**
     * Removes the key-value pair of the given key from the object store.
     * @param {string} key The primary key to delete along with the associated object.
     * @returns {Promise} The promise resolves after writing to the current object store finished.
     */
    async remove(key) {
        const oldValue = await this.get(key);
        // Only update if there was a value with that key.
        if (oldValue === undefined) {
            return Promise.resolve();
        }
        return new Promise((resolve, error) => {
            const batch = this._dbBackend.batch();

            this._indexVersion = (this._indexVersion + 1) % LevelDBBackend.MAX_INDEX_VERSION;
            batch.del(key);
            batch.put('_indexVersion', this._indexVersion);
            batch.write(err => {
                if (err) {
                    error(err);
                    return;
                }

                // Remove from all indices.
                const indexPromises = [];
                for (const index of this._indices.values()) {
                    indexPromises.push(index.remove(key, oldValue));
                }
                Promise.all(indexPromises).then(() => {
                    resolve();
                }).catch(error);
            });
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
    values(query=null) {
        if (query !== null && query instanceof Query) {
            return query.values(this);
        }
        return new Promise((resolve, error) => {
            const result = [];
            this._dbBackend.createReadStream(LevelDBTools.convertKeyRange(query, { 'values': true, 'keys': false }))
                .on('data', data => {
                    result.push(data);
                })
                .on('error', err => {
                    error(err);
                })
                .on('end', () => {
                    resolve(result);
                });
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
    keys(query=null) {
        if (query !== null && query instanceof Query) {
            return query.keys(this);
        }
        return new Promise((resolve, error) => {
            const result = new Set();
            this._dbBackend.createReadStream(LevelDBTools.convertKeyRange(query, { 'values': false, 'keys': true }))
                .on('data', data => {
                    result.add(data);
                })
                .on('error', err => {
                    error(err);
                })
                .on('end', () => {
                    resolve(result);
                })
                .on('close', () => {
                    resolve(result);
                });
        });
    }

    /**
     * Returns a promise of the object whose primary key is maximal for the given range.
     * If the optional query is not given, it returns the object whose key is maximal.
     * If the query is of type KeyRange, it returns the object whose primary key is maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<*>} A promise of the object relevant to the query.
     */
    maxValue(query=null) {
        return new Promise((resolve, error) => {
            this._dbBackend.createReadStream(LevelDBTools.convertKeyRange(query, { 'values': true, 'keys': false, 'limit': 1, 'reverse': true }))
                .on('data', data => {
                    resolve(data);
                })
                .on('error', err => {
                    error(err);
                });
        });
    }

    /**
     * Returns a promise of the key being maximal for the given range.
     * If the optional query is not given, it returns the maximal key.
     * If the query is of type KeyRange, it returns the key being maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<string>} A promise of the key relevant to the query.
     */
    maxKey(query=null) {
        return new Promise((resolve, error) => {
            this._dbBackend.createReadStream(LevelDBTools.convertKeyRange(query, { 'values': false, 'keys': true, 'limit': 1, 'reverse': true }))
                .on('data', data => {
                    resolve(data);
                })
                .on('error', err => {
                    error(err);
                });
        });
    }

    /**
     * Returns a promise of the object whose primary key is minimal for the given range.
     * If the optional query is not given, it returns the object whose key is minimal.
     * If the query is of type KeyRange, it returns the object whose primary key is minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<*>} A promise of the object relevant to the query.
     */
    minValue(query=null) {
        return new Promise((resolve, error) => {
            this._dbBackend.createReadStream(LevelDBTools.convertKeyRange(query, { 'values': true, 'keys': false, 'limit': 1, 'reverse': false }))
                .on('data', data => {
                    resolve(data);
                })
                .on('error', err => {
                    error(err);
                });
        });
    }

    /**
     * Returns a promise of the key being minimal for the given range.
     * If the optional query is not given, it returns the minimal key.
     * If the query is of type KeyRange, it returns the key being minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<string>} A promise of the key relevant to the query.
     */
    minKey(query=null) {
        return new Promise((resolve, error) => {
            this._dbBackend.createReadStream(LevelDBTools.convertKeyRange(query, { 'values': false, 'keys': true, 'limit': 1, 'reverse': false }))
                .on('data', data => {
                    resolve(data);
                })
                .on('error', err => {
                    error(err);
                });
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
        return (await this.keys(query)).size;
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

    /** @type {string} The own table name. */
    get tableName() {
        return this._tableName;
    }

    /** @type {{encode:function(), decode:function(), buffer:boolean, type:string}} The value encoding used. */
    get valueEncoding() {
        return this._valueEncoding;
    }

    /** @type {string} The database directory. */
    get databaseDirectory() {
        return this._databaseDirectory;
    }

    /** @type {number} The version number of the corresponding primary index. */
    get indexVersion() {
        return this._indexVersion;
    }

    /** @type {number} The version number of the database. */
    get databaseVersion() {
        return this._dbVersion;
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
        if (tx._truncated) {
            await this.truncate();
        }
        return new Promise((resolve, error) => {
            this._indexVersion = (this._indexVersion + 1) % LevelDBBackend.MAX_INDEX_VERSION;
            const batch = this._dbBackend.batch();

            for (const key of tx._removed) {
                batch.del(key);
            }
            for (const [key, value] of tx._modified) {
                batch.put(key, value);
            }
            batch.put('_indexVersion', this._indexVersion);
            batch.write(err => {
                if (err) {
                    error(err);
                    return;
                }

                // Update all indices.
                const indexPromises = [];
                for (const index of this._indices.values()) {
                    indexPromises.push(index._apply(tx));
                }
                Promise.all(indexPromises).then(() => {
                    resolve(true);
                }).catch(error);
            });
        });
    }

    /**
     * Empties the object store.
     * @returns {Promise} The promise resolves after emptying the object store.
     */
    async truncate() {
        await this._close();
        await LevelDBBackend.destroy(this._databaseDirectory);
        this._dbBackend = levelup(this._databaseDirectory, {
            keyEncoding: 'ascii',
            valueEncoding: this._valueEncoding
        });

        // Truncate all indices.
        const indexPromises = [];
        for (const index of this._indices.values()) {
            indexPromises.push(index.truncate());
        }
        return Promise.all(indexPromises);
    }

    /**
     * Fully deletes the object store and its indices.
     * @returns {Promise} The promise resolves after deleting the object store and its indices.
     */
    async destroy() {
        await this._close();
        await LevelDBBackend.destroy(this._databaseDirectory);

        // Truncate all indices.
        const indexPromises = [];
        for (const index of this._indices.values()) {
            indexPromises.push(index.destroy());
        }
        return Promise.all(indexPromises);
    }

    /**
     * Removes all database related files from the folder.
     * @returns {Promise} The promise resolves after deleting the object store and its indices.
     */
    static async destroy(databaseDirectory) {
        return new Promise((resolve, error) => {
            require('leveldown').destroy(databaseDirectory, err => {
                if (err) {
                    error(err);
                    return;
                }
                resolve();
            });
        });
    }

    /**
     * Internal method to close the backend's connection.
     * @returns {Promise} The promise resolves after closing the object store.
     * @private
     */
    _close() {
        return new Promise((resolve, error) => {
            this._dbBackend.close(err => {
                if (err) {
                    error(err);
                    return;
                }
                resolve();
            });
        });
    }

    /**
     * Applies a function on all key-value pairs in the database.
     * This method uses a levelDB read stream to accomplish its task.
     * @param {function(key:string, value:*)} func The function to apply.
     * @returns {Promise} The promise resolves after applying the function to all entries.
     */
    map(func) {
        return new Promise((resolve, error) => {
            this._dbBackend.createReadStream({ 'values': true, 'keys': true })
                .on('data', data => {
                    func(data.key, data.value);
                })
                .on('error', err => {
                    error(err);
                })
                .on('end', () => {
                    resolve();
                });
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
    deleteIndex(indexName) {
        if (this._db.connected) throw 'Cannot delete index while connected';
        const index = new PersistentIndex(this, indexName, '');
        return index.destroy();
    }

    /**
     * Closes the object store and potential connections.
     * @returns {Promise} The promise resolves after closing the object store.
     */
    async close() {
        await this._close();
        const indexPromises = [];
        for (const index of this._indices.values()) {
            indexPromises.close(index.close());
        }
        return Promise.all(indexPromises);
    }
}
LevelDBBackend.MAX_INDEX_VERSION = 1000;
Class.register(LevelDBBackend);
