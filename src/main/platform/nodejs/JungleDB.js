const fs = require('fs');

class JungleDB {
    /**
     * @param {string} databaseDir
     * @param {number} dbVersion
     * @param {function()} [onUpgradeNeeded]
     * @param {{encode:function(), decode:function(), buffer:boolean, type:string}} [valueEncoding]
     */
    constructor(databaseDir, dbVersion, onUpgradeNeeded, valueEncoding=JungleDB.JSON_ENCODING) {
        this._databaseDir = databaseDir.endsWith('/') ? databaseDir : `${databaseDir}/`;
        this._dbVersion = dbVersion;
        this._onUpgradeNeeded = onUpgradeNeeded;
        this._valueEncoding = valueEncoding;
        this._connected = false;
        this._objectStores = new Map();
        this._objectStoreBackends = [];
        this._objectStoresToDelete = [];
    }

    /**
     * @returns {Promise.<number>}
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
     * @returns {Promise}
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

    connect() {
        return this._initDB();
    }

    /**
     * @returns {Promise}
     */
    close() {
        this._connected = false;
        const promises = [];
        for (const objStore of this._objectStores.values()) {
            promises.push(objStore.close());
        }
        return Promise.all(promises);
    }

    async destroy() {
        fs.unlinkSync(`${this._databaseDir}.dbVersion`);
        const promises = [];
        // Create new ObjectStores.
        for (const objStore of this._objectStoreBackends) {
            promises.push(objStore.destroy());
        }
        return Promise.all(promises);
    }

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

    /** @type {boolean} */
    get connected() {
        return this._connected;
    }

    /**
     * @param {string} tableName
     * @returns {ObjectStore}
     */
    getObjectStore(tableName) {
        return this._objectStores.get(tableName);
    }

    /**
     * @param {string} tableName
     */
    createObjectStore(tableName) {
        if (this._connected) throw 'Cannot create ObjectStore while connected';
        // LevelDB already implements a LRU cache. so we don't need to cache it.
        const backend = new LevelDBBackend(this, tableName, this._databaseDir, this._valueEncoding);
        const objStore = new ObjectStore(backend, this);
        this._objectStores.set(tableName, objStore);
        this._objectStoreBackends.push(backend);
        return objStore;
    }

    /**
     * @param {string} tableName
     */
    async deleteObjectStore(tableName) {
        if (this._connected) throw 'Cannot delete ObjectStore while connected';
        this._objectStoresToDelete.push(tableName);
    }
}
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
