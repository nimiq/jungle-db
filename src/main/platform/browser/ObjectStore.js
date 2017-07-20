class ObjectStore {
    /**
     * @param {JungleDB} db
     * @param {string} tableName
     */
    constructor(db, tableName) {
        this._db = db;
        this._tableName = tableName;
        this._indices = [];
    }

    /**
     * @param {IDBObjectStore} objectStore
     */
    init(objectStore) {
        // Create indices.
        for (const [indexName, keyPath] of this._indices) {
            objectStore.createIndex(indexName, keyPath, { unique: false });
        }
    }

    /**
     * @param {string} key
     * @returns {Promise.<*>}
     */
    async get(key) {
        const db = await this._db.backend;
        return new Promise((resolve, error) => {
            const getTx = db.transaction([this._tableName])
                .objectStore(this._tableName)
                .get(key);
            getTx.onsuccess = event => resolve(event.target.result);
            getTx.onerror = error;
        });
    }

    /**
     * @param {string} key
     * @param {*} value
     * @returns {Promise}
     */
    async put(key, value) {
        const db = await this._db.backend;
        return new Promise((resolve, error) => {
            const putTx = db.transaction([this._tableName], 'readwrite')
                .objectStore(this._tableName)
                .put(value, key);
            putTx.onsuccess = event => resolve(event.target.result);
            putTx.onerror = error;
        });
    }

    /**
     * @param {string} key
     * @returns {Promise}
     */
    async remove(key) {
        const db = await this._db.backend;
        return new Promise((resolve, error) => {
            const deleteTx = db.transaction([this._tableName], 'readwrite')
                .objectStore(this._tableName)
                .delete(key);
            deleteTx.onsuccess = event => resolve(event.target.result);
            deleteTx.onerror = error;
        });
    }

    /**
     * @param {IKeyRange|*} [query]
     * @returns {Promise.<Array.<*>>}
     */
    async getAll(query=null) {
        const db = await this._db.backend;
        return new Promise((resolve, reject) => {
            const getRequest = db.transaction([this._tableName], 'readonly')
                .objectStore(this._tableName)
                .getAll(query);
            getRequest.onsuccess = () => resolve(getRequest.result);
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    /**
     * @param {IKeyRange|*} [query]
     * @returns {Promise.<string>}
     */
    async getKey(query=null) {
        const db = await this._db.backend;
        return new Promise((resolve, reject) => {
            const getRequest = db.transaction([this._tableName], 'readonly')
                .objectStore(this._tableName)
                .getKey(query);
            getRequest.onsuccess = () => resolve(getRequest.result);
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    /**
     * @abstract
     * @param {IKeyRange|*} [query]
     * @returns {Promise.<Array.<string>>}
     */
    async getAllKeys(query=null) {
        const db = await this._db.backend;
        return new Promise((resolve, reject) => {
            const getRequest = db.transaction([this._tableName], 'readonly')
                .objectStore(this._tableName)
                .getAllKeys(query);
            getRequest.onsuccess = () => resolve(getRequest.result);
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    /**
     * @abstract
     * @param {IKeyRange|*} [query]
     * @returns {Promise.<*>}
     */
    async getMax(query=null) {
        const db = await this._db.backend;
        return new Promise((resolve, reject) => {
            const openCursorRequest = db.transaction([this._tableName], 'readonly')
                .objectStore(this._tableName)
                .openCursor(query, 'prev');
            openCursorRequest.onsuccess = () => resolve(openCursorRequest.result.value);
            openCursorRequest.onerror = () => reject(openCursorRequest.error);
        });
    }

    /**
     * @abstract
     * @param {IKeyRange|*} [query]
     * @returns {Promise.<string>>}
     */
    async getMaxKey(query=null) {
        const db = await this._db.backend;
        return new Promise((resolve, reject) => {
            const openCursorRequest = db.transaction([this._tableName], 'readonly')
                .objectStore(this._tableName)
                .openKeyCursor(query, 'prev');
            openCursorRequest.onsuccess = () => resolve(openCursorRequest.result.primaryKey);
            openCursorRequest.onerror = () => reject(openCursorRequest.error);
        });
    }

    /**
     * @abstract
     * @param {IKeyRange|*} [query]
     * @returns {Promise.<*>}
     */
    async getMin(query=null) {
        const db = await this._db.backend;
        return new Promise((resolve, reject) => {
            const openCursorRequest = db.transaction([this._tableName], 'readonly')
                .objectStore(this._tableName)
                .openCursor(query, 'next');
            openCursorRequest.onsuccess = () => resolve(openCursorRequest.result.value);
            openCursorRequest.onerror = () => reject(openCursorRequest.error);
        });
    }

    /**
     * @abstract
     * @param {IKeyRange|*} [query]
     * @returns {Promise.<string>>}
     */
    async getMinKey(query=null) {
        const db = await this._db.backend;
        return new Promise((resolve, reject) => {
            const openCursorRequest = db.transaction([this._tableName], 'readonly')
                .objectStore(this._tableName)
                .openKeyCursor(query, 'next');
            openCursorRequest.onsuccess = () => resolve(openCursorRequest.result.primaryKey);
            openCursorRequest.onerror = () => reject(openCursorRequest.error);
        });
    }

    /**
     * @abstract
     * @param {IKeyRange|*} [query]
     * @returns {Promise.<Array.<string>>}
     */
    async count(query=null) {
        const db = await this._db.backend;
        return new Promise((resolve, reject) => {
            const getRequest = db.transaction([this._tableName], 'readonly')
                .objectStore(this._tableName)
                .count(query);
            getRequest.onsuccess = () => resolve(getRequest.result);
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    /**
     * @returns {ITransaction}
     */
    async transaction() {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @param {string} indexName
     * @returns {IIndex}
     */
    index(indexName) {
        return new Index(this, indexName);
    }

    /** @type {Promise.<IDBDatabase>} */
    get backend() {
        return this._db.backend;
    }

    /** @type {string} */
    get tableName() {
        return this._tableName;
    }

    /**
     * @param {string} indexName
     * @param {string|Array.<string>} [keyPath]
     */
    async ensureIndex(indexName, keyPath) {
        if (this._db.connected) throw 'Cannot create Index while connected';
        keyPath = keyPath || indexName;
        this._indices.push([indexName, keyPath]);
    }
}
Class.register(ObjectStore);
