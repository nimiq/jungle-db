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
     * @param {ICodec} [codec] A default codec for the object store.
     */
    constructor(db, tableName, codec=null) {
        this._db = db;

        this._tableName = tableName;
        /** @type {Map.<string,PersistentIndex>} */
        this._indices = new Map();

        this._codec = codec;
    }

    /** @type {boolean} */
    get connected() {
        return this._db.connected;
    }

    get _valueEncoding() {
        return this._codec === null ? JungleDB.JSON_ENCODING : this._codec.valueEncoding;
    }

    /**
     * Extends a batch operation with a tree transaction.
     * @param {LevelDBBackend} backend The index backend.
     * @param {TreeTransaction} treeTx The tree transaction.
     */
    static extendBatch(batch, backend, treeTx) {
        // Shortcut if treeTx is null or undefined.
        if (!treeTx) {
            return;
        }

        batch.push({key: '_root', value: backend.encode(treeTx.root.id), type: 'put', prefix: backend._dbBackend, valueEncoding: backend._valueEncoding});
        for (const node of treeTx.removed) {
            batch.push({key: ''+node.id, type: 'del', prefix: backend._dbBackend, valueEncoding: backend._valueEncoding});
        }
        for (const node of treeTx.modified) {
            batch.push({key: ''+node.id, value: backend.encode(node.toJSON()), type: 'put', prefix: backend._dbBackend, valueEncoding: backend._valueEncoding});
        }
    }

    /**
     * Initialises the persisted indices of the object store.
     * @returns {Promise.<Array.<PersistentIndex>>} The list of indices.
     */
    async init() {
        this._dbBackend = this._db.backend.sublevel(this._tableName, { valueEncoding: this._valueEncoding });
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
     * Internal method called to decode a single value.
     * @param {*} value Value to be decoded.
     * @returns {*} The decoded value, either by the object store's default or the overriding decoder if given.
     */
    decode(value) {
        if (value === undefined) {
            return undefined;
        }
        if (this._codec !== null && this._codec !== undefined) {
            return this._codec.decode(value);
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
                resolve(this.decode(value));
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
        const batch = [];

        batch.push({key: key, value: this.encode(value), type: 'put'});
        for (const index of this._indices.values()) {
            LevelDBBackend.extendBatch(batch, index.backend, index.put(key, value, oldValue));
        }

        return new Promise((resolve, error) => {
            this._dbBackend.batch(batch, err => {
                if (err) {
                    error(err);
                    return;
                }
                resolve();
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
        const batch = [];

        batch.push({key: key, type: 'del'});
        for (const index of this._indices.values()) {
            LevelDBBackend.extendBatch(batch, index.backend, index.remove(key, oldValue));
        }

        return new Promise((resolve, error) => {
            this._dbBackend.batch(batch, err => {
                if (err) {
                    error(err);
                    return;
                }
                resolve();
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
                    result.push(this.decode(data));
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
                    resolve(this.decode(data));
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
                    resolve(this.decode(data));
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
        const batch = [];

        for (const key of tx._removed) {
            batch.push({key: key, type: 'del'});
        }
        for (const [key, value] of tx._modified) {
            batch.push({key: key, value: this.encode(value), type: 'put'});
        }

        for (const index of this._indices.values()) {
            LevelDBBackend.extendBatch(batch, index.backend, await index._apply(tx));
        }

        return new Promise((resolve, error) => {
            this._dbBackend.batch(batch, err => {
                if (err) {
                    error(err);
                    return;
                }

                resolve(true);
            });
        });
    }

    /**
     * Truncates a sublevel object store.
     * @param db A levelDB instance.
     * @param {string} tableName A table's name.
     * @returns {Promise.<void>}
     */
    static async truncate(db, tableName) {
        const sub = db.sublevel(tableName);

        const deletePromises = [];
        await new Promise((resolve, error) => {
            sub.createReadStream({ 'values': false, 'keys': true })
                .on('data', data => {
                    deletePromises.push(new Promise((resolveInner, errorInner) => {
                        sub.del(data, err => {
                            if (err) {
                                errorInner(err);
                                return;
                            }
                            resolveInner();
                        });
                    }));
                })
                .on('error', err => {
                    error(err);
                })
                .on('end', () => {
                    resolve();
                });
        });

        return Promise.all(deletePromises);
    }

    /**
     * Empties the object store.
     * @returns {Promise} The promise resolves after emptying the object store.
     */
    async truncate() {
        const deletePromises = [LevelDBBackend.truncate(this._db.backend, this._tableName)];
        // Truncate all indices.
        for (const index of this._indices.values()) {
            deletePromises.push(index.truncate());
        }
        return Promise.all(deletePromises);
    }

    /**
     * Fully deletes the object store and its indices.
     * @returns {Promise} The promise resolves after deleting the object store and its indices.
     */
    destroy() {
        return this.truncate();
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
                    func(data.key, this.decode(data.value));
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
    createIndex(indexName, keyPath, multiEntry=false) {
        if (this._db.connected) throw 'Cannot create index while connected';
        keyPath = keyPath || indexName;
        const index = new PersistentIndex(this, this._db, indexName, keyPath, multiEntry);
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

    /**
     * Creates a new transaction, ensuring read isolation
     * on the most recently successfully committed state.
     * @returns {Transaction} The transaction object.
     */
    transaction() {
        throw 'Unsupported operation';
    }
}
Class.register(LevelDBBackend);
