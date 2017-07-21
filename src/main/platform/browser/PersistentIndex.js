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
            getRequest.onsuccess = () => resolve(Set.setify(getRequest.result));
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
            const openCursorRequest = this._index(db).openCursor(query, 'prev');
            openCursorRequest.onsuccess = () => resolve(openCursorRequest.result.value);
            openCursorRequest.onerror = () => reject(openCursorRequest.error);
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
            const openCursorRequest = this._index(db).openKeyCursor(query, 'prev');
            openCursorRequest.onsuccess = () => resolve(Set.setify(openCursorRequest.result.primaryKey));
            openCursorRequest.onerror = () => reject(openCursorRequest.error);
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
            const openCursorRequest = this._index(db).openCursor(query, 'next');
            openCursorRequest.onsuccess = () => resolve(openCursorRequest.result.value);
            openCursorRequest.onerror = () => reject(openCursorRequest.error);
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
            const openCursorRequest = this._index(db).openKeyCursor(query, 'next');
            openCursorRequest.onsuccess = () => resolve(Set.setify(openCursorRequest.result.primaryKey));
            openCursorRequest.onerror = () => reject(openCursorRequest.error);
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
            const getRequest = this._index(db).count(query);
            getRequest.onsuccess = () => resolve(getRequest.result);
            getRequest.onerror = () => reject(getRequest.error);
        });
    }
}
Class.register(PersistentIndex);

