const leveldown = require('leveldown');
const levelup = require('levelup');
const sublevel = require('level-sublevel');

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
     * @param {string} databaseDir The name of the database.
     * @param {number} dbVersion The current version of the database.
     * @param {function(oldVersion:number, newVersion:number)} [onUpgradeNeeded] A function to be called after upgrades of the structure.
     */
    constructor(databaseDir, dbVersion, onUpgradeNeeded) {
        if (dbVersion <= 0) throw new Error('The version provided must not be less or equal to 0');
        this._databaseDir = databaseDir.endsWith('/') ? databaseDir : `${databaseDir}/`;
        this._dbVersion = dbVersion;
        this._onUpgradeNeeded = onUpgradeNeeded;
        this._connected = false;
        this._objectStores = new Map();
        this._objectStoreBackends = [];
        this._objectStoresToDelete = [];
    }

    /**
     * Returns a promise of the current database version.
     * @returns {Promise.<number>} The promise for the database version.
     * @private
     */
    _readDBVersion() {
        return new Promise((resolve, reject) => {
            this._db.get('_dbVersion', { valueEncoding: 'ascii' }, (err, value) => {
                if (err) {
                    resolve(0);
                    return;
                }
                resolve(parseInt(value));
            });
        });
    }

    /**
     * Writes a new database version to the db.
     * @returns {Promise} A promise that resolves after successfully writing the database version.
     * @private
     */
    _writeDBVersion(version) {
        return new Promise((resolve, reject) => {
            this._db.put('_dbVersion', `${version}`, { valueEncoding: 'ascii' }, err => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        });
    }

    /** The underlying LevelDB. */
    get backend() {
        return this._db;
    }

    /**
     * Connects to the indexedDB.
     * @returns {Promise} A promise resolving on successful connection.
     */
    connect() {
        if (this._db) return Promise.resolve(this._db);

        const fs = require('fs');
        // Ensure existence of directory.
        if (!fs.existsSync(this._databaseDir)){
            fs.mkdirSync(this._databaseDir);
        }

        this._db = sublevel(levelup(leveldown(this._databaseDir), {
            keyEncoding: 'ascii'
        }));

        return this._initDB();
    }

    /**
     * Closes the database connection.
     * @returns {Promise} The promise resolves after closing the database.
     */
    close() {
        if (this._connected) {
            this._connected = false;
            return new Promise((resolve, error) => {
                this._db.close(err => {
                    if (err) {
                        error(err);
                        return;
                    }
                    resolve();
                });
            });
        }
        return Promise.resolve();
    }

    /**
     * Fully deletes the database.
     * @returns {Promise} The promise resolves after deleting the database.
     */
    async destroy() {
        await this.close();
        return LevelDBBackend.destroy(this._databaseDir);
    }

    /**
     * Internal method that is called for opening the database connection.
     * Also handles the db version upgrade.
     * @returns {Promise.<void>} A promise that resolves after successful completion.
     * @private
     */
    async _initDB() {
        const storedVersion = await this._readDBVersion();
        let promises = [];
        // Upgrade database.
        if (this._dbVersion > storedVersion) {
            // Delete object stores, if requested.
            for (const { tableName, upgradeCondition } of this._objectStoresToDelete) {
                if (upgradeCondition === null || upgradeCondition === true || upgradeCondition(storedVersion, this._dbVersion)) {
                    promises.push(LevelDBBackend.truncate(this._db, tableName));
                }
            }
            this._objectStoresToDelete = [];

            // The order of the above promises does not matter.
            await Promise.all(promises);
            await this._writeDBVersion(this._dbVersion);
            promises = [];
        }

        // Create new ObjectStores.
        for (const { backend, upgradeCondition } of this._objectStoreBackends) {
            // We do not explicitly create object stores, therefore, we ignore the upgrade condition.
            promises.push(backend.init(storedVersion, this._dbVersion));
        }

        // The order of the above promises does not matter.
        await Promise.all(promises);

        // Upgrade database (part 2).
        if (this._dbVersion > storedVersion) {
            // Call user defined function if requested.
            if (this._onUpgradeNeeded) {
                await this._onUpgradeNeeded(storedVersion, this._dbVersion);
            }
        }

        this._connected = true;
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
     * @returns {ObjectStore}
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
     * @param {{codec:?ICodec, persistent:?boolean, upgradeCondition:?boolean|?function(oldVersion:number, newVersion:number):boolean}|ICodec} [options] An options object (for deprecated usage: A codec for the object store).
     * @param {boolean} [persistentArg] If set to false, this object store is not persistent.
     * @returns {IObjectStore}
     */
    createObjectStore(tableName, options=null, persistentArg=true) {
        let { codec = null, persistent = persistentArg, upgradeCondition = null } = (typeof options === 'object' && options !== null) ? options : {};
        if (typeof options !== 'object' && options !== null) codec = options;

        if (this._connected) throw new Error('Cannot create ObjectStore while connected');
        if (this._objectStores.has(tableName)) {
            return this._objectStores.get(tableName);
        }

        // LevelDB already implements a LRU cache. so we don't need to cache it.
        const backend = persistent
            ? new LevelDBBackend(this, tableName, codec)
            : new InMemoryBackend(tableName, codec);
        const objStore = new ObjectStore(backend, this, tableName);
        this._objectStores.set(tableName, objStore);
        this._objectStoreBackends.push({ backend, upgradeCondition });
        return objStore;
    }

    /**
     * Deletes an object store.
     * This method has to be called before connecting to the database.
     * @param {string} tableName
     * @param {{upgradeCondition:?boolean|?function(oldVersion:number, newVersion:number):boolean}} [options]
     */
    deleteObjectStore(tableName, options={}) {
        let { upgradeCondition = null } = options || {};

        if (this._connected) throw new Error('Cannot delete ObjectStore while connected');
        this._objectStoresToDelete.push({ tableName, upgradeCondition });
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
            let batch = [];

            const infos = await Promise.all(tx1.transactions.map(tx => tx.objectStore._backend.applyCombined(tx)));
            for (const info of infos) {
                if (typeof info === 'function') {
                    functions.push(info);
                } else {
                    batch = batch.concat(info);
                }
            }

            return new Promise((resolve, error) => {
                if (batch.length > 0) {
                    tx1.backend.backend.batch(batch, err => {
                        if (err) {
                            error(err);
                            return;
                        }

                        Promise.all(functions.map(f => f())).then(() => {
                            resolve(true);
                        });
                    });
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
 * A LevelDB JSON encoding that can handle Uint8Arrays and Sets.
 * @type {{encode: function(val:*):*, decode: function(val:*):*, buffer: boolean, type: string}}
 */
JungleDB.JSON_ENCODING = {
    encode: JSONUtils.stringify,
    decode: JSONUtils.parse,
    buffer: false,
    type: 'json'
};
Class.register(JungleDB);
