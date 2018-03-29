/**
 * This is a wrapper around the levelup interface for the LevelDB.
 * It manages the access to a single table/object store.
 * @implements {IBackend}
 */
class LevelDBBackend {
    /**
     * Creates a wrapper given a JungleDB, the table's name, the database directory and an encoding.
     * @param {JungleDB} db The JungleDB object managing the connection.
     * @param {string} tableName The table name this object store represents.
     * @param {ICodec} [codec] A default codec for the object store.
     * @param {object} [options] Advanced options.
     */
    constructor(db, tableName, codec=null, options = {}) {
        this._db = db;

        this._tableName = tableName;
        /** @type {Map.<string,PersistentIndex>} */
        this._indices = new Map();
        this._indicesToCreate = new Map();
        this._indicesToDelete = [];

        this._codec = codec;
        this._keyEncoding = options && options.keyEncoding ? options.keyEncoding : null;
    }

    /**
     * Truncates a sublevel object store.
     * @param db A levelDB instance.
     * @param {string} tableName A table's name.
     * @returns {Promise.<void>}
     */
    static async truncate(db, tableName) {
        const sub = db.sublevel(tableName);
        const batch = await LevelDBBackend._truncate(sub);

        return new Promise((resolve, error) => {
            sub.batch(batch, err => {
                if (err) {
                    error(err);
                    return;
                }

                resolve(true);
            });
        });
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

    /** @type {boolean} */
    get connected() {
        return this._db.connected;
    }

    /** @type {string} The own table name. */
    get tableName() {
        return this._tableName;
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
     * @returns {Promise.<Array.<PersistentIndex>>} The list of indices.
     */
    async init(oldVersion, newVersion) {
        this._dbBackend = this._db.backend.sublevel(this._tableName, this._setKeyEncoding({ valueEncoding: this._valueEncoding }));

        let indexPromises = [];
        // Delete indices.
        for (const { indexName, upgradeCondition } of this._indicesToDelete) {
            if (upgradeCondition === null || upgradeCondition === true || (typeof upgradeCondition === 'function' && upgradeCondition(oldVersion, newVersion))) {
                const index = new PersistentIndex(this, this._db, indexName, '');
                indexPromises.push(index.init(oldVersion, newVersion, false).then(() => index.destroy()));
            }
        }
        this._indicesToDelete = [];
        await Promise.all(indexPromises);

        indexPromises = [];
        for (const [indexName, { index, upgradeCondition }] of this._indicesToCreate) {
            indexPromises.push(index.init(oldVersion, newVersion, upgradeCondition));
        }
        return Promise.all(indexPromises);
    }

    /**
     * Internal method called to decode a single value.
     * @param {*} value Value to be decoded.
     * @param {string} key Key corresponding to the value.
     * @returns {*} The decoded value, either by the object store's default or the overriding decoder if given.
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
     * @param {RetrievalConfig} [options] Advanced retrieval options.
     * @returns {Promise.<*>} A promise of the object stored under the given key, or undefined if not present.
     */
    async get(key, options = {}) {
        return new Promise((resolve, error) => {
            this._dbBackend.get(key, (err, value) => {
                if (err) {
                    resolve(undefined);
                    return;
                }
                try {
                    resolve(this.decode(value, key));
                } catch (e) {
                    error(e);
                }
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
            this._dbBackend.createReadStream(LevelDBTools.convertKeyRange(query, { 'values': true, 'keys': true }))
                .on('data', data => {
                    try {
                        result.push(this.decode(data.value, data.key));
                    } catch (e) {
                        error(e);
                    }
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
     * Iterates over the keys in a given range and direction.
     * The callback is called for each primary key fulfilling the query
     * until it returns false and stops the iteration.
     * @param {function(key:string):boolean} callback A predicate called for each key until returning false.
     * @param {boolean} ascending Determines the direction of traversal.
     * @param {KeyRange} query An optional KeyRange to narrow down the iteration space.
     * @returns {Promise} The promise resolves after all elements have been streamed.
     */
    keyStream(callback, ascending=true, query=null) {
        return new Promise((resolve, error) => {
            const stream = this._dbBackend.createReadStream(LevelDBTools.convertKeyRange(query, { 'values': false, 'keys': true, 'reverse': !ascending }));
            let stopped = false;
            stream.on('data', data => {
                try {
                    if (!callback(data)) {
                        stopped = true;
                        stream.pause();
                        stream.destroy();
                    }
                } catch (e) {
                    error(e);
                }
            }).on('error', err => {
                if (!stopped) {
                    error(err);
                }
            }).on('end', () => {
                resolve();
            }).on('close', () => {
                resolve();
            });
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
        return new Promise((resolve, error) => {
            const stream = this._dbBackend.createReadStream(LevelDBTools.convertKeyRange(query, { 'values': true, 'keys': true, 'reverse': !ascending }));
            let stopped = false;
            stream.on('data', data => {
                try {
                    if (!callback(this.decode(data.value, data.key), data.key)) {
                        stopped = true;
                        stream.pause();
                        stream.destroy();
                    }
                } catch (e) {
                    stopped = true;
                    stream.pause();
                    stream.destroy();
                    error(e);
                }
            }).on('error', err => {
                if (!stopped) {
                    error(err);
                } else {
                    resolve();
                }
            }).on('end', () => {
                resolve();
            }).on('close', () => {
                resolve();
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
            this._dbBackend.createReadStream(LevelDBTools.convertKeyRange(query, { 'values': true, 'keys': true, 'limit': 1, 'reverse': true }))
                .on('data', data => {
                    try {
                        resolve(this.decode(data.value, data.key));
                    } catch (e) {
                        error(e);
                    }
                })
                .on('error', err => {
                    error(err);
                })
                .on('end', () => {
                    resolve(undefined);
                })
                .on('close', () => {
                    resolve(undefined);
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
                })
                .on('end', () => {
                    resolve(undefined);
                })
                .on('close', () => {
                    resolve(undefined);
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
            this._dbBackend.createReadStream(LevelDBTools.convertKeyRange(query, { 'values': true, 'keys': true, 'limit': 1, 'reverse': false }))
                .on('data', data => {
                    try {
                        resolve(this.decode(data.value, data.key));
                    } catch (e) {
                        error(e);
                    }
                })
                .on('error', err => {
                    error(err);
                })
                .on('end', () => {
                    resolve(undefined);
                })
                .on('close', () => {
                    resolve(undefined);
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
                })
                .on('end', () => {
                    resolve(undefined);
                })
                .on('close', () => {
                    resolve(undefined);
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
     * Returns the index of the given name.
     * If the index does not exist, it returns undefined.
     * @param {string} indexName The name of the requested index.
     * @returns {IIndex} The index associated with the given name.
     */
    index(indexName) {
        return this._indices.get(indexName);
    }

    /**
     * Returns the necessary information in order to flush a combined transaction.
     * @param {Transaction} tx The transaction that should be applied to this backend.
     * @returns {Promise.<Array>} An array containing the batch operations.
     */
    async applyCombined(tx) {
        let batch = [];

        if (tx._truncated) {
            batch = await this._truncate();
        }

        for (const key of tx._removed) {
            batch.push(this._setKeyEncoding({key: key, type: 'del', prefix: this._dbBackend, valueEncoding: this._valueEncoding}));
        }
        for (const [key, value] of tx._modified) {
            batch.push(this._setKeyEncoding({key: key, value: this.encode(value), type: 'put', prefix: this._dbBackend, valueEncoding: this._valueEncoding}));
        }

        for (const index of this._indices.values()) {
            batch = batch.concat(await index._apply(tx));
        }

        return batch;
    }

    /**
     * Empties the object store.
     * @returns {Promise} The promise resolves after emptying the object store.
     */
    async truncate() {
        const batch = await this._truncate();
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
     * Fully deletes the object store and its indices.
     * @returns {Promise} The promise resolves after deleting the object store and its indices.
     */
    destroy() {
        return this.truncate();
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
                    try {
                        func(data.key, this.decode(data.value, data.key));
                    } catch (e) {
                        error(e);
                    }
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
     * @param {IndexConfig} [options] An options object.
     */
    createIndex(indexName, keyPath, options = {}) {
        let { multiEntry = false, upgradeCondition = null, unique = false, keyEncoding = null, leveldbKeyEncoding = null } = options || {};

        if (this._db.connected) throw new Error('Cannot create index while connected');
        keyPath = keyPath || indexName;
        const index = new PersistentIndex(this, this._db, indexName, keyPath, multiEntry, unique, leveldbKeyEncoding || keyEncoding);
        this._indices.set(indexName, index);
        this._indicesToCreate.set(indexName, { index, upgradeCondition });
    }

    /**
     * Deletes a secondary index from the object store.
     * @param indexName
     * @param {{upgradeCondition:?boolean|?function(oldVersion:number, newVersion:number):boolean}} [options]
     */
    deleteIndex(indexName, options = {}) {
        let { upgradeCondition = null } = options || {};

        if (this._db.connected) throw new Error('Cannot delete index while connected');
        this._indicesToDelete.push({ indexName, upgradeCondition });
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
     * Checks whether an object store implements the ISynchronousObjectStore interface.
     * @returns {boolean} The transaction object.
     */
    isSynchronous() {
        return false;
    }

    /**
     * Prepares a batch operation to truncate a sublevel.
     * @param sub A levelDB sublevel instance.
     * @param [keyEncoding]
     * @returns {Promise.<Array>}
     */
    static async _truncate(sub, keyEncoding) {
        return new Promise((resolve, error) => {
            const batch = [];
            sub.createReadStream({ 'values': false, 'keys': true })
                .on('data', data => {
                    const op = { key: data, type: 'del', prefix: sub };
                    if (keyEncoding) {
                        op.keyEncoding = keyEncoding;
                    }
                    batch.push(op);
                })
                .on('error', err => {
                    error(err);
                })
                .on('end', () => {
                    resolve(batch);
                });
        });
    }

    get _valueEncoding() {
        return this._codec === null ? JungleDB.JSON_ENCODING :
            (this._codec.valueEncoding || this._codec.leveldbValueEncoding || JungleDB.JSON_ENCODING);
    }

    /**
     * @param op
     * @return
     * @private
     */
    _setKeyEncoding(op) {
        if (this._keyEncoding) {
            op.keyEncoding = this._keyEncoding;
        }
        return op;
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
        let batch = await this.applyCombined(tx);

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
     * Empties the object store.
     * @returns {Promise} The promise resolves after emptying the object store.
     */
    async _truncate() {
        let batch = await LevelDBBackend._truncate(this._dbBackend);
        // Truncate all indices.
        for (const index of this._indices.values()) {
            batch = batch.concat(index._truncate());
        }
        return batch;
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
}
Class.register(LevelDBBackend);
