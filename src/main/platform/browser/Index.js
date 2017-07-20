/**
 * @implements IIndex
 */
class Index {
    /**
     * @param {ObjectStore} objectStore
     * @param {string} indexName
     */
    constructor(objectStore, indexName) {
        this._objectStore = objectStore;
        this._indexName = indexName;
    }

    /**
     * @param {IDBDatabase} db
     * @private
     */
    _index(db) {
        return db.transaction([this._objectStore.tableName], 'readonly')
            .objectStore(this._objectStore.tableName)
            .index(this._indexName);
    }

    /**
     * @param {IKeyRange|*} [query]
     * @returns {Promise.<*>}
     */
    async get(query=null) {
        const db = await this._objectStore.backend;
        return new Promise((resolve, reject) => {
            const getRequest = this._index(db).get(query);
            getRequest.onsuccess = () => resolve(getRequest.result);
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    /**
     * @param {IKeyRange|*} [query]
     * @returns {Promise.<Array.<*>>}
     */
    async getAll(query=null) {
        const db = await this._objectStore.backend;
        return new Promise((resolve, reject) => {
            const getRequest = this._index(db).getAll(query);
            getRequest.onsuccess = () => resolve(getRequest.result);
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    /**
     * @param {IKeyRange|*} [query]
     * @returns {Promise.<string>}
     */
    async getKey(query=null) {
        const db = await this._objectStore.backend;
        return new Promise((resolve, reject) => {
            const getRequest = this._index(db).getKey(query);
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
        const db = await this._objectStore.backend;
        return new Promise((resolve, reject) => {
            const getRequest = this._index(db).getAllKeys(query);
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
        const db = await this._objectStore.backend;
        return new Promise((resolve, reject) => {
            const openCursorRequest = this._index(db).openCursor(query, 'prev');
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
        const db = await this._objectStore.backend;
        return new Promise((resolve, reject) => {
            const openCursorRequest = this._index(db).openKeyCursor(query, 'prev');
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
        const db = await this._objectStore.backend;
        return new Promise((resolve, reject) => {
            const openCursorRequest = this._index(db).openCursor(query, 'next');
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
        const db = await this._objectStore.backend;
        return new Promise((resolve, reject) => {
            const openCursorRequest = this._index(db).openKeyCursor(query, 'next');
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
        const db = await this._objectStore.backend;
        return new Promise((resolve, reject) => {
            const getRequest = this._index(db).count(query);
            getRequest.onsuccess = () => resolve(getRequest.result);
            getRequest.onerror = () => reject(getRequest.error);
        });
    }
}
Class.register(Index);

