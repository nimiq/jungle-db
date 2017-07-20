class JungleDB {
    /**
     * @param {string} name
     * @param {number} dbVersion
     * @param {function()} onUpgradeNeeded
     */
    constructor(name, dbVersion, onUpgradeNeeded) {
        this._name = name;
        this._dbVersion = dbVersion;
        this._onUpgradeNeeded = onUpgradeNeeded;
        this._connected = false;
        this._objectStores = {};
        this._objectStoresToDelete = [];
    }

    connect() {
        if (this._db) return Promise.resolve(this._db);

        const indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.OIndexedDB || window.msIndexedDB;
        const request = indexedDB.open(this._name, this._dbVersion);
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

    _initDB(event) {
        const db = event.target.result;

        // Delete existing ObjectStores.
        for (const tableName of this._objectStoresToDelete) {
            db.deleteObjectStore(tableName);
        }
        delete this._objectStoresToDelete;

        // Create new ObjectStores.
        for (const tableName in this._objectStores) {
            const objStore = db.createObjectStore(tableName);
            // Create indices.
            this._objectStores[tableName].init(objStore);
        }

        // Call user defined function if requested.
        if (this._onUpgradeNeeded) {
            this._onUpgradeNeeded();
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
        return this._objectStores[tableName];
    }

    /**
     * @param {string} tableName
     * @returns {ObjectStore}
     */
    createObjectStore(tableName) {
        if (this._connected) throw 'Cannot create ObjectStore while connected';
        const objStore = new ObjectStore(this, tableName);
        this._objectStores[tableName] = objStore;
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
Class.register(JungleDB);
