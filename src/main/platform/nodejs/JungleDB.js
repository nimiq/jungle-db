const fs = require('fs');

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
     * @param {function()} [onUpgradeNeeded] A function to be called after upgrades of the structure.
     */
    constructor(databaseDir, dbVersion, onUpgradeNeeded) {
        if (dbVersion <= 0) throw 'The version provided must not be less or equal to 0.';
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
            fs.readFile(`${this._databaseDir}.dbVersion`, 'utf8', (err, data) => {
                if (err) {
                    resolve(-1);
                    return;
                }
                resolve(parseInt(data));
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
            fs.writeFile(`${this._databaseDir}.dbVersion`, `${version}`, 'utf8', err => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        });
    }

    /**
     * Connects to the indexedDB.
     * @returns {Promise} A promise resolving on successful connection.
     */
    connect() {
        return this._initDB();
    }

    /**
     * Closes the database connection.
     * @returns {Promise} The promise resolves after closing the database.
     */
    close() {
        if (this._connected) {
            this._connected = false;
            const promises = [];
            for (const objStore of this._objectStores.values()) {
                promises.push(objStore.close());
            }
            return Promise.all(promises);
        }
        return Promise.resolve();
    }

    /**
     * Fully deletes the database.
     * @returns {Promise} The promise resolves after deleting the database.
     */
    async destroy() {
        fs.unlinkSync(`${this._databaseDir}.dbVersion`);
        const promises = [];
        // Create new ObjectStores.
        for (const objStore of this._objectStoreBackends) {
            promises.push(objStore.destroy());
        }
        return Promise.all(promises);
    }

    /**
     * Internal method that is called for opening the database connection.
     * Also handles the db version upgrade.
     * @returns {Promise.<void>} A promise that resolves after successful completion.
     * @private
     */
    async _initDB() {
        if (!fs.existsSync(this._databaseDir)){
            fs.mkdirSync(this._databaseDir);
        }

        const storedVersion = await this._readDBVersion();
        let promises = [];
        // Upgrade database.
        if (this._dbVersion > storedVersion) {
            // Delete object stores, if requested.
            for (const tableName of this._objectStoresToDelete) {
                promises.push(LevelDBBackend.destroy(this._databaseDir + tableName));
            }
            delete this._objectStoresToDelete;

            // The order of the above promises does not matter.
            await Promise.all(promises);
            await this._writeDBVersion(this._dbVersion);
            promises = [];
        }

        // Create new ObjectStores.
        for (const objStore of this._objectStoreBackends) {
            promises.push(objStore.init());
        }

        // The order of the above promises does not matter.
        await Promise.all(promises);

        // Upgrade database (part 2).
        if (this._dbVersion > storedVersion) {
            // Call user defined function if requested.
            if (this._onUpgradeNeeded) {
                await this._onUpgradeNeeded();
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
     * @returns {IObjectStore}
     */
    static createVolatileObjectStore(codec=null) {
        return new ObjectStore(new InMemoryBackend('', codec), this);
    }

    /**
     * Creates a new object store (and allows to access it).
     * This method always has to be called before connecting to the database.
     * If it is not called, the object store will not be accessible afterwards.
     * If a call is newly introduced, but the database version did not change,
     * the table does not exist yet.
     * @param {string} tableName The name of the object store.
     * @param {ICodec} [codec] A codec for the object store (by default, it is the identity codec with JSON encoding).
     * @param {boolean} [persistent] If set to false, this object store is not persistent.
     * @returns {IObjectStore}
     */
    createObjectStore(tableName, codec=null, persistent=true) {
        if (this._connected) throw 'Cannot create ObjectStore while connected';
        if (this._objectStores.has(tableName)) {
            return this._objectStores.get(tableName);
        }

        // LevelDB already implements a LRU cache. so we don't need to cache it.
        const backend = persistent
            ? new LevelDBBackend(this, tableName, this._databaseDir, codec)
            : new InMemoryBackend(tableName, codec);
        const objStore = new ObjectStore(backend, this);
        this._objectStores.set(tableName, objStore);
        this._objectStoreBackends.push(backend);
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
}
/**
 * A LevelDB JSON encoding that can handle Uint8Arrays and Sets.
 * @type {{encode: function(val:*):*, decode: function(val:*):*, buffer: boolean, type: string}}
 */
JungleDB.JSON_ENCODING = {
    encode: val => JSON.stringify(val, (k, v) => {
        if (v instanceof Uint8Array) {
            return Array.from(v);
        }
        if (v instanceof Set) {
            return Array.from(v);
        }
        return v;
    }),
    decode: JSON.parse,
    buffer: false,
    type: 'json'
};
Class.register(JungleDB);
