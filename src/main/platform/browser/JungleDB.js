class JungleDB {
    /**
     * @param {string} name
     * @param {number} dbVersion
     * @param {function()} onUpgradeNeeded
     */
    constructor(name, dbVersion, onUpgradeNeeded) {
        this._databaseDir = name;
        this._dbVersion = dbVersion;
        this._onUpgradeNeeded = onUpgradeNeeded;
        this._connected = false;
        this._objectStores = new Map();
        this._objectStoresToDelete = [];
    }

    connect() {
        if (this._db) return Promise.resolve(this._db);

        const indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.OIndexedDB || window.msIndexedDB;
        const request = indexedDB.open(this._databaseDir, this._dbVersion);
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

    async _initDB(event) {
        const db = event.target.result;

        // Delete existing ObjectStores.
        for (const tableName of this._objectStoresToDelete) {
            db.deleteObjectStore(tableName);
        }
        delete this._objectStoresToDelete;

        // Create new ObjectStores.
        for (const [tableName, backend] of this._objectStores) {
            const IDBobjStore = db.createObjectStore(tableName);
            // Create indices.
            backend.init(IDBobjStore);
        }

        // Call user defined function if requested.
        if (this._onUpgradeNeeded) {
            await this._onUpgradeNeeded();
        }
    }

    /** @type {Promise.<IDBDatabase>} */
    get backend() {
        return this.connect();
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
        if (!this._connected) throw 'JungleDB is not connected';
        return this._objectStores.get(tableName);
    }

    /**
     * @param {string} tableName
     */
    createObjectStore(tableName) {
        if (this._connected) throw 'Cannot create ObjectStore while connected';
        const cachedBackend = new CachedBackend(new IDBBackend(this, tableName));
        const objStore = new ObjectStore(cachedBackend);
        this._objectStores.set(tableName, objStore);
    }

    /**
     * @param {string} tableName
     */
    async deleteObjectStore(tableName) {
        if (this._connected) throw 'Cannot delete ObjectStore while connected';
        this._objectStoresToDelete.push(tableName);
    }
}
Class.register(JungleDB);
