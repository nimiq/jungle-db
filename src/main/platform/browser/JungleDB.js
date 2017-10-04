/**
 * @implements {IJungleDB}
 */
class JungleDB {
    /**
     * Initiates a new database connection. All changes to the database structure
     * require an increase in the version number.
     * Whenever new object stores need to be created, old ones deleted,
     * or indices created/deleted, the dbVersion number has to be increased.
     * When the version number increases, the given function onUpgradeNeeded is called
     * after modifying the database structure.
     * @param {string} name The name of the database.
     * @param {number} dbVersion The current version of the database.
     * @param {function()} [onUpgradeNeeded] A function to be called after upgrades of the structure.
     */
    constructor(name, dbVersion, onUpgradeNeeded) {
        if (dbVersion <= 0) throw 'The version provided must not be less or equal to 0.';
        this._databaseDir = name;
        this._dbVersion = dbVersion;
        this._onUpgradeNeeded = onUpgradeNeeded;
        this._connected = false;
        this._objectStores = new Map();
        this._objectStoreBackends = new Map();
        this._objectStoresToDelete = [];
    }

    /**
     * @type {IDBFactory} The browser's IDB factory.
     * @private
     */
    get _indexedDB() {
        return window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.OIndexedDB || window.msIndexedDB;
    }

    /**
     * Connects to the indexedDB.
     * @returns {Promise.<IDBDatabase>} A promise resolving on successful connection.
     * The raw IDBDatabase object should not be used.
     */
    connect() {
        if (this._db) return Promise.resolve(this._db);

        const request = this._indexedDB.open(this._databaseDir, this._dbVersion);
        const that = this;

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                that._connected = true;
                that._db = request.result;
                resolve(request.result);
            };

            request.onupgradeneeded = event => that._initDB(event);
        });
    }

    /**
     * Internal method that is called when a db upgrade is required.
     * @param {*} event The obupgradeneeded event.
     * @returns {Promise.<void>} A promise that resolves after successful completion.
     * @private
     */
    async _initDB(event) {
        const db = event.target.result;

        // Delete existing ObjectStores.
        for (const tableName of this._objectStoresToDelete) {
            db.deleteObjectStore(tableName);
        }
        delete this._objectStoresToDelete;

        // Create new ObjectStores.
        for (const [tableName, objStore] of this._objectStoreBackends) {
            const IDBobjStore = db.createObjectStore(tableName);
            // Create indices.
            objStore.init(IDBobjStore);
        }
        delete this._objectStoreBackends;

        // Call user defined function if requested.
        if (this._onUpgradeNeeded) {
            await this._onUpgradeNeeded();
        }
    }

    /** @type {IDBDatabase} The underlying IDBDatabase. */
    get backend() {
        return this._db;
    }

    /** @type {boolean} Whether a connection is established. */
    get connected() {
        return this._connected;
    }

    /**
     * Returns the ObjectStore object for a given table name.
     * @param {string} tableName The table name to access.
     * @returns {ObjectStore} The ObjectStore object.
     */
    getObjectStore(tableName) {
        return this._objectStores.get(tableName);
    }

    /**
     * Creates a volatile object store (non-persistent).
     * @param {ICodec} [codec] A codec for the object store.
     * @returns {IObjectStore}
     */
    static createVolatileObjectStore(codec=null) {
        return new ObjectStore(new InMemoryBackend('', codec), null);
    }

    /**
     * Creates a new object store (and allows to access it).
     * This method always has to be called before connecting to the database.
     * If it is not called, the object store will not be accessible afterwards.
     * If a call is newly introduced, but the database version did not change,
     * the table does not exist yet.
     * @param {string} tableName The name of the object store.
     * @param {ICodec} [codec] A codec for the object store.
     * @param {boolean} [persistent] If set to false, this object store is not persistent.
     * @returns {IObjectStore}
     */
    createObjectStore(tableName, codec=null, persistent=true) {
        if (this._connected) throw 'Cannot create ObjectStore while connected';
        if (this._objectStores.has(tableName)) {
            return this._objectStores.get(tableName);
        }
        const backend = persistent
            ? new IDBBackend(this, tableName, codec)
            : new InMemoryBackend(tableName, codec);
        const cachedBackend = new CachedBackend(backend);
        const objStore = new ObjectStore(cachedBackend, this);
        this._objectStores.set(tableName, objStore);
        this._objectStoreBackends.set(tableName, backend);
        return objStore;
    }

    /**
     * Deletes an object store.
     * This method has to be called before connecting to the database.
     * @param {string} tableName
     */
    async deleteObjectStore(tableName) {
        if (this._connected) throw 'Cannot delete ObjectStore while connected';
        this._objectStoresToDelete.push(tableName);
    }

    /**
     * Closes the database connection.
     * @returns {Promise} The promise resolves after closing the database.
     */
    async close() {
        if (this._connected) {
            this._connected = false;
            this.backend.close();
        }
    }

    /**
     * Fully deletes the database.
     * @returns {Promise} The promise resolves after deleting the database.
     */
    async destroy() {
        await this.close();
        return new Promise((resolve, reject) => {
            const req = this._indexedDB.deleteDatabase(this._databaseDir);
            req.onsuccess = resolve;
            req.onerror = reject;
        });
    }

    /**
     * Is used to commit multiple transactions atomically.
     * This guarantees that either all transactions are written or none.
     * The method takes a list of transactions (at least two transactions).
     * If the commit was successful, the method returns true, and false otherwise.
     * @param {Transaction|CombinedTransaction} tx1 The first transaction
     * (a CombinedTransaction object is only used internally).
     * @param {Transaction} tx2 The second transaction.
     * @param {...Transaction} txs A list of further transactions to commit together.
     * @returns {Promise.<boolean>} A promise of the success outcome.
     */
    static async commitCombined(tx1, tx2, ...txs) {
        // If tx1 is a CombinedTransaction, flush it to the database.
        if (tx1 instanceof CombinedTransaction) {
            const functions = [];
            /** @type {Array.<EncodedTransaction>} */
            const encodedTxs = [];
            const tableNames = [];

            const infos = await Promise.all(tx1.transactions.map(tx => tx.objectStore._backend.applyCombined(tx)));
            for (const info of infos) {
                if (typeof info === 'function') {
                    functions.push(info);
                } else {
                    encodedTxs.push(info);
                    tableNames.push(info.tableName);
                }
            }

            const db = tx1.backend !== null ? tx1.backend.backend : null;
            return new Promise((resolve, reject) => {
                if (tableNames.length > 0) {
                    const idbTx = db.transaction(tableNames, 'readwrite');

                    for (const encodedTx of encodedTxs) {
                        const objSt = idbTx.objectStore(encodedTx.tableName);

                        if (encodedTx.truncated) {
                            objSt.clear();
                        }
                        for (const key of encodedTx.removed) {
                            objSt.delete(key);
                        }
                        for (const [key, value] of encodedTx.modified) {
                            objSt.put(value, key);
                        }
                    }

                    idbTx.oncomplete = () => {
                        functions.forEach(f => f());
                        resolve(true);
                    };
                    idbTx.onerror = reject;
                } else {
                    functions.forEach(f => f());
                    resolve(true);
                }
            });
        }
        txs.push(tx1);
        txs.push(tx2);
        if (!txs.every(tx => tx instanceof Transaction)) {
            throw 'Invalid arguments supplied';
        }
        const ctx = new CombinedTransaction(...txs);
        return ctx.commit();
    }
}
Class.register(JungleDB);
