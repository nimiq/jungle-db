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
     * @param {{onUpgradeNeeded:?function(oldVersion:number, newVersion:number, jdb:JungleDB)}} [options]
     */
    constructor(name, dbVersion, options = {}) {
        if (dbVersion <= 0) throw new Error('The version provided must not be less or equal to 0');
        this._databaseDir = name;
        this._dbVersion = dbVersion;
        this._oldDbVersion = null;
        this._onUpgradeNeeded = options.onUpgradeNeeded;
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
            request.onsuccess = async () => {
                that._connected = true;
                that._db = request.result;

                // Call user defined function if requested.
                if (that._oldDbVersion !== null && that._onUpgradeNeeded) {
                    await that._onUpgradeNeeded(that._oldDbVersion, that._dbVersion, that);
                }

                resolve(request.result);
            };

            request.onerror = reject;
            request.onupgradeneeded = event => that._initDB(event, request);
        });
    }

    /**
     * Internal method that is called when a db upgrade is required.
     * @param {IDBVersionChangeEvent} event The obupgradeneeded event.
     * @param {IDBRequest} request
     * @returns {Promise.<void>} A promise that resolves after successful completion.
     * @private
     */
    async _initDB(event, request) {
        const db = event.target.result;

        // Delete existing ObjectStores.
        for (const { tableName, upgradeCondition } of this._objectStoresToDelete) {
            if (db.objectStoreNames.contains(tableName) && (upgradeCondition === null || upgradeCondition === true || (typeof upgradeCondition === 'function' && upgradeCondition(event.oldVersion, event.newVersion)))) {
                db.deleteObjectStore(tableName);
            }
        }
        this._objectStoresToDelete = [];

        // Create new ObjectStores.
        for (const [tableName, { backend, upgradeCondition }] of this._objectStoreBackends) {
            let IDBobjStore;
            // Only check upgradeCondition if object store does not already exist!
            if (!db.objectStoreNames.contains(tableName)
                && (upgradeCondition === null || upgradeCondition === true
                    || (typeof upgradeCondition === 'function' && upgradeCondition(event.oldVersion, event.newVersion)))) {
                IDBobjStore = db.createObjectStore(tableName);
            } else {
                IDBobjStore = request.transaction.objectStore(tableName);
            }
            // Create indices.
            backend.init(IDBobjStore, event.oldVersion, event.newVersion);
        }

        this._oldDbVersion = event.oldVersion;

        this._objectStoreBackends.clear();
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
     * @param {{codec:?ICodec}} [options] An options object.
     * @returns {ObjectStore}
     */
    static createVolatileObjectStore(options = {}) {
        const { codec = null } = options || {};
        return new ObjectStore(new InMemoryBackend('', codec), null);
    }

    /**
     * Creates a new object store (and allows to access it).
     * This method always has to be called before connecting to the database.
     * If it is not called, the object store will not be accessible afterwards.
     * If a call is newly introduced, but the database version did not change,
     * the table does not exist yet.
     * @param {string} tableName The name of the object store.
     * @param {ObjectStoreConfig} [options] An options object.
     * @returns {IObjectStore}
     */
    createObjectStore(tableName, options = {}) {
        const { codec = null, persistent = true, upgradeCondition = null, enableLruCache = true, lruCacheSize = CachedBackend.MAX_CACHE_SIZE, rawLruCacheSize = 0 } = options || {};

        if (this._connected) throw new Error('Cannot create ObjectStore while connected');
        if (this._objectStores.has(tableName)) {
            return this._objectStores.get(tableName);
        }

        // Create backend
        let backend = null;
        if (persistent) {
            backend = new IDBBackend(this, tableName, codec);
        } else {
            backend = new InMemoryBackend(tableName, codec);
        }
        // Create cache if enabled
        let cachedBackend = backend;
        if (persistent && enableLruCache) {
            cachedBackend = new CachedBackend(backend, lruCacheSize, rawLruCacheSize);
        }

        const objStore = new ObjectStore(cachedBackend, this, tableName);
        this._objectStores.set(tableName, objStore);
        this._objectStoreBackends.set(tableName, { backend, upgradeCondition });
        return objStore;
    }

    /**
     * Deletes an object store.
     * This method has to be called before connecting to the database.
     * @param {string} tableName
     * @param {{upgradeCondition:?boolean|?function(oldVersion:number, newVersion:number):boolean}, indexNames:Array.<string>} [options]
     */
    deleteObjectStore(tableName, options = {}) {
        let { upgradeCondition = null } = options || {};

        if (this._connected) throw new Error('Cannot delete ObjectStore while connected');
        this._objectStoresToDelete.push({ tableName, upgradeCondition });
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
                let tmp = info;
                if (!Array.isArray(info)) {
                    tmp = [info];
                }
                for (const innerInfo of tmp) {
                    if (typeof innerInfo === 'function') {
                        functions.push(innerInfo);
                    } else {
                        encodedTxs.push(innerInfo);
                        tableNames.push(innerInfo.tableName);
                    }
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
                        Promise.all(functions.map(f => f())).then(() => {
                            resolve(true);
                        });
                    };
                    idbTx.onerror = reject;
                    idbTx.onabort = reject;
                } else {
                    Promise.all(functions.map(f => f())).then(() => {
                        resolve(true);
                    });
                }
            });
        }
        txs.push(tx1);
        txs.push(tx2);
        if (!txs.every(tx => tx instanceof Transaction)) {
            throw new Error('Invalid arguments supplied');
        }
        const ctx = new CombinedTransaction(...txs);
        return ctx.commit();
    }

    toString() {
        return `JungleDB{name=${this._databaseDir}}`;
    }
}
/**
 * Empty encodings.
 */
JungleDB.JSON_ENCODING = {};
JungleDB.BINARY_ENCODING = {};
JungleDB.STRING_ENCODING = {};
JungleDB.NUMBER_ENCODING = {};
JungleDB.GENERIC_ENCODING = {};
Class.register(JungleDB);
