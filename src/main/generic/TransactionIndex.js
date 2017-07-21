class TransactionIndex extends InMemoryIndex {
    /**
     * @param {Transaction} objectStore
     * @param {IObjectStore} backend
     * @returns {Object}
     */
    static derive(objectStore, backend) {
        const indices = new Map();
        for (const [name, index] of backend.indices) {
            indices.set(name, new TransactionIndex(objectStore, backend, name, index.keyPath, index.multiEntry));
        }
        return indices;
    }

    /** @type {IIndex} */
    get _index() {
        return this._backend.index(this._name);
    }

    /**
     * @param {Transaction} objectStore
     * @param {IObjectStore} backend
     * @param {string|Array.<string>} keyPath
     * @param {boolean} multiEntry
     */
    constructor(objectStore, backend, name, keyPath, multiEntry=false) {
        super(objectStore, keyPath, multiEntry);
        this._backend = backend;
        this._name = name;
    }

    /**
     * @param {KeyRange|*} [query]
     * @returns {Promise.<Set.<string>>}
     */
    async keys(query=null) {
        let keys = await this._index.keys(query);
        // Remove keys that have been deleted or modified.
        keys = keys.difference(this._objectStore._removed);
        keys = keys.difference(this._objectStore._modified.keys());

        const newKeys = await InMemoryIndex.prototype.keys.call(this, query);
        return keys.union(newKeys);
    }

    /**
     * @param {KeyRange|*} [query]
     * @returns {Promise.<Array.<*>>}
     */
    async values(query=null) {
        const keys = await this.keys(query);
        return super._retrieveValues(keys);
    }

    /**
     * @param {KeyRange|*} [query]
     * @returns {Promise.<Array.<*>>}
     */
    async maxValues(query=null) {
        const keys = await this.maxKeys(query);
        return super._retrieveValues(keys);
    }

    /**
     * @param {KeyRange|*} [query]
     * @returns {Promise.<Set.<string>>}
     */
    async maxKeys(query=null) {
        let keys = await this._index.maxKeys(query);
        // Remove keys that have been deleted or modified.
        keys = keys.difference(this._objectStore._removed);
        keys = keys.difference(this._objectStore._modified.keys());

        const newKeys = await InMemoryIndex.prototype.maxKeys.call(query);

        if (keys.size === 0) {
            return newKeys;
        } else if (newKeys.size === 0) {
            return keys;
        }

        // Both contain elements, check which one is larger.
        const valueBackend = await this._objectStore.get(keys.sampleElement());
        const valueTx = await this._objectStore.get(newKeys.sampleElement());

        const iKeyBackend = ObjectUtils.byKeyPath(valueBackend, this.keyPath);
        const iKeyTx = ObjectUtils.byKeyPath(valueTx, this.keyPath);

        if (iKeyBackend > iKeyTx) {
            return keys;
        } else if (iKeyBackend < iKeyTx) {
            return newKeys;
        }
        return keys.union(newKeys);
    }

    /**
     * @param {KeyRange|*} [query]
     * @returns {Promise.<Array.<*>>}
     */
    async minValues(query=null) {
        const keys = await this.minKeys(query);
        return super._retrieveValues(keys);
    }

    /**
     * @param {KeyRange|*} [query]
     * @returns {Promise.<Set.<string>>}
     */
    async minKeys(query=null) {
        let keys = await this._index.minKeys(query);
        // Remove keys that have been deleted or modified.
        keys = keys.difference(this._objectStore._removed);
        keys = keys.difference(this._objectStore._modified.keys());

        const newKeys = await InMemoryIndex.prototype.minKeys.call(query);

        if (keys.size === 0) {
            return newKeys;
        } else if (newKeys.size === 0) {
            return keys;
        }

        // Both contain elements, check which one is larger.
        const valueBackend = await this._objectStore.get(keys.sampleElement());
        const valueTx = await this._objectStore.get(newKeys.sampleElement());

        const iKeyBackend = ObjectUtils.byKeyPath(valueBackend, this.keyPath);
        const iKeyTx = ObjectUtils.byKeyPath(valueTx, this.keyPath);

        if (iKeyBackend < iKeyTx) {
            return keys;
        } else if (iKeyBackend > iKeyTx) {
            return newKeys;
        }
        return keys.union(newKeys);
    }

    /**
     * @param {KeyRange|*} [query]
     * @returns {Promise.<number>}
     */
    async count(query=null) {
        // Unfortunately, we cannot do better than getting keys + counting.
        return (await this.keys(query)).size;
    }
}
Class.register(TransactionIndex);
