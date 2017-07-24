class JungleDB {
    /**
     * @param {string} name
     * @param {number} dbVersion
     * @param {function()} [onUpgradeNeeded]
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

    get _indexedDB() {
        return window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.OIndexedDB || window.msIndexedDB;
    }

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
        return this._objectStores.get(tableName);
    }

    /**
     * @param {string} tableName
     */
    createObjectStore(tableName) {
        if (this._connected) throw 'Cannot create ObjectStore while connected';
        const backend = new IDBBackend(this, tableName);
        const cachedBackend = new CachedBackend(backend);
        const objStore = new ObjectStore(cachedBackend, this);
        this._objectStores.set(tableName, objStore);
        this._objectStoreBackends.set(tableName, backend);
        return objStore;
    }

    /**
     * @param {string} tableName
     */
    async deleteObjectStore(tableName) {
        if (this._connected) throw 'Cannot delete ObjectStore while connected';
        this._objectStoresToDelete.push(tableName);
    }

    /**
     * @returns {Promise}
     */
    async close() {
        this._connected = false;
        (await this.backend).close();
    }

    async destroy() {
        await this.close();
        return new Promise((resolve, reject) => {
            const req = this._indexedDB.deleteDatabase(this._databaseDir);
            req.onsuccess = resolve;
            req.onerror = reject;
        });
    }
}
Class.register(JungleDB);
