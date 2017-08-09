/**
 * @implements IIndex
 */
class PersistentIndex {
    /**
     * @param {ObjectStore} objectStore
     * @param {string} indexName
     * @param {string|Array.<string>} keyPath
     * @param {boolean} multiEntry
     */
    constructor(objectStore, indexName, keyPath, multiEntry=false) {
        this._objectStore = objectStore;
        this._indexName = indexName;
        this._keyPath = keyPath;
        this._multiEntry = multiEntry;
    }

    /**
     * @returns {Promise}
     */
    async truncate() {
        // Will automatically be truncated.
    }

    /**
     * @type {string}
     */
    get keyPath() {
        return this._keyPath;
    }

    /**
     * @type {boolean}
     */
    get multiEntry() {
        return this._multiEntry;
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
     * @param {KeyRange|*} [query]
     * @returns {Promise.<Array.<*>>}
     */
    async values(query=null) {
        query = IDBTools.convertKeyRange(query);
        const db = await this._objectStore.backend;
        return new Promise((resolve, reject) => {
            const getRequest = this._index(db).getAll(query);
            getRequest.onsuccess = () => resolve(getRequest.result);
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    /**
     * @param {KeyRange|*} [query]
     * @returns {Promise.<Set.<string>>}
     */
    async keys(query=null) {
        query = IDBTools.convertKeyRange(query);
        const db = await this._objectStore.backend;
        return new Promise((resolve, reject) => {
            const getRequest = this._index(db).getAllKeys(query);
            getRequest.onsuccess = () => resolve(Set.from(getRequest.result));
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    /**
     * @param {KeyRange|*} [query]
     * @returns {Promise.<Array.<*>>}
     */
    async maxValues(query=null) {
        query = IDBTools.convertKeyRange(query);
        const db = await this._objectStore.backend;
        return new Promise((resolve, reject) => {
            const request = this._index(db).openCursor(query, 'prev');
            request.onsuccess = () => resolve(request.result ? request.result.value : []);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * @param {KeyRange|*} [query]
     * @returns {Promise.<Set.<string>>}
     */
    async maxKeys(query=null) {
        query = IDBTools.convertKeyRange(query);
        const db = await this._objectStore.backend;
        return new Promise((resolve, reject) => {
            const request = this._index(db).openKeyCursor(query, 'prev');
            request.onsuccess = () => resolve(Set.from(request.result ? request.result.primaryKey : []));
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * @param {KeyRange|*} [query]
     * @returns {Promise.<Array.<*>>}
     */
    async minValues(query=null) {
        query = IDBTools.convertKeyRange(query);
        const db = await this._objectStore.backend;
        return new Promise((resolve, reject) => {
            const request = this._index(db).openCursor(query, 'next');
            request.onsuccess = () => resolve(request.result ? request.result.value : []);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * @param {KeyRange|*} [query]
     * @returns {Promise.<Set.<string>>}
     */
    async minKeys(query=null) {
        query = IDBTools.convertKeyRange(query);
        const db = await this._objectStore.backend;
        return new Promise((resolve, reject) => {
            const request = this._index(db).openKeyCursor(query, 'next');
            request.onsuccess = () => resolve(Set.from(request.result ? request.result.primaryKey : []));
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * @abstract
     * @param {KeyRange|*} [query]
     * @returns {Promise.<number>}
     */
    async count(query=null) {
        query = IDBTools.convertKeyRange(query);
        const db = await this._objectStore.backend;
        return new Promise((resolve, reject) => {
            const request = this._index(db).count(query);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}
Class.register(PersistentIndex);

