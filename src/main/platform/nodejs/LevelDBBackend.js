const levelup = require('levelup');

/**
 * @implements {IObjectStore}
 */
class LevelDBBackend {
    /**
     * @param {JungleDB} db
     * @param {string} tableName
     * @param {string} databaseDir
     * @param {{encode:function(), decode:function(), buffer:boolean, type:string}} valueEncoding
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
     * @returns {Promise}
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
     * @type {Map.<string,IIndex>}
     */
    get indices() {
        return this._indices;
    }

    /**
     * @param {string} key
     * @returns {Promise.<*>}
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
     * @param {string} key
     * @param {*} value
     * @returns {Promise}
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
     * @param {string} key
     * @returns {Promise}
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
     * @param {Query|KeyRange} [query]
     * @returns {Promise.<Array.<*>>}
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
     * @param {Query|KeyRange} [query]
     * @returns {Promise.<Set.<string>>}
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
     * @param {KeyRange} [query]
     * @returns {Promise.<*>}
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
     * @param {KeyRange} [query]
     * @returns {Promise.<string>}
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
     * @param {KeyRange} [query]
     * @returns {Promise.<*>}
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
     * @param {KeyRange} [query]
     * @returns {Promise.<string>}
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

    /** @type {string} */
    get tableName() {
        return this._tableName;
    }

    get valueEncoding() {
        return this._valueEncoding;
    }

    get databaseDirectory() {
        return this._databaseDirectory;
    }

    get indexVersion() {
        return this._indexVersion;
    }

    get databaseVersion() {
        return this._dbVersion;
    }

    /**
     * @param {Transaction|IndexTransaction} tx
     * @returns {Promise.<boolean>}
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
                    resolve();
                }).catch(error);
            });
        });
    }

    /**
     * @returns {Promise}
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
     * @returns {Promise}
     */
    async destroy() {
        await this._close();
        await LevelDBBackend.destroy(this._databaseDirectory);

        // Truncate all indices.
        const indexPromises = [];
        for (const index of this._indices.values()) {
            indexPromises.push(index.destroy());
        }
    }

    /**
     * @returns {Promise}
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
     * @returns {Promise}
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
     * @param {function(key:string, value:*)} func
     * @returns {Promise}
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
     * @param {string} indexName
     * @param {string|Array.<string>} [keyPath]
     * @param {boolean} [multiEntry]
     */
    async createIndex(indexName, keyPath, multiEntry=false) {
        if (this._db.connected) throw 'Cannot create index while connected';
        keyPath = keyPath || indexName;
        const index = new PersistentIndex(this, indexName, keyPath, multiEntry);
        this._indices.set(indexName, index);
    }

    /**
     * @returns {Promise}
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
