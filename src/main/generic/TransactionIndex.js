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
        return this._backend.index(this._databaseDir);
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
        this._databaseDir = name;
    }

    /**
     * @param {KeyRange|*} [query]
     * @returns {Promise.<Set.<string>>}
     */
    async keys(query=null) {
        const promises = [];
        promises.push(this._index.keys(query));
        promises.push(InMemoryIndex.prototype.keys.call(this, query));
        let [keys, newKeys] = await Promise.all(promises);
        // Remove keys that have been deleted or modified.
        keys = keys.difference(this._objectStore._removed);
        keys = keys.difference(this._objectStore._modified.keys());
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
     * @template T
     * @param {Set.<T>} s
     * @returns {T}
     * @private
     */
    static _sampleElement(s) {
        return s.size > 0 ? s.values().next().value : undefined;
    }

    /**
     * @param {KeyRange|*} [query]
     * @returns {Promise.<Set.<string>>}
     */
    async maxKeys(query=null) {
        let backendKeys = await this._index.maxKeys(query);

        // Remove keys that have been deleted or modified.
        let sampleElement = TransactionIndex._sampleElement(backendKeys);
        const value = await this._backend.get(sampleElement);
        let maxIKey = sampleElement ? ObjectUtils.byKeyPath(value, this.keyPath) : undefined;
        backendKeys = backendKeys.difference(this._objectStore._removed);
        backendKeys = backendKeys.difference(this._objectStore._modified.keys());

        while (sampleElement !== undefined && backendKeys.size === 0) {
            const tmpQuery = KeyRange.upperBound(maxIKey, true);
            backendKeys = await this._index.maxKeys(tmpQuery);

            // Remove keys that have been deleted or modified.
            sampleElement = TransactionIndex._sampleElement(backendKeys);
            const value = await this._backend.get(sampleElement);
            maxIKey = sampleElement ? ObjectUtils.byKeyPath(value, this.keyPath) : undefined;
            backendKeys = backendKeys.difference(this._objectStore._removed);
            backendKeys = backendKeys.difference(this._objectStore._modified.keys());

            // If we get out of the range, stop here.
            if (maxIKey && query !== null && !query.includes(maxIKey)) {
                backendKeys = new Set();
                break;
            }
        }

        const newKeys = await InMemoryIndex.prototype.maxKeys.call(this, query);

        if (backendKeys.size === 0) {
            return newKeys;
        } else if (newKeys.size === 0) {
            return backendKeys;
        }

        // Both contain elements, check which one is larger.
        const valueTx = await this._objectStore.get(TransactionIndex._sampleElement(newKeys));

        const iKeyBackend = maxIKey;
        const iKeyTx = ObjectUtils.byKeyPath(valueTx, this.keyPath);

        if (iKeyBackend > iKeyTx) {
            return backendKeys;
        } else if (iKeyBackend < iKeyTx) {
            return newKeys;
        }
        return backendKeys.union(newKeys);
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
        let backendKeys = await this._index.minKeys(query);

        // Remove keys that have been deleted or modified.
        let sampleElement = TransactionIndex._sampleElement(backendKeys);
        const value = await this._backend.get(sampleElement);
        let minIKey = sampleElement ? ObjectUtils.byKeyPath(value, this.keyPath) : undefined;
        backendKeys = backendKeys.difference(this._objectStore._removed);
        backendKeys = backendKeys.difference(this._objectStore._modified.keys());

        while (sampleElement !== undefined && backendKeys.size === 0) {
            const tmpQuery = KeyRange.lowerBound(minIKey, true);
            backendKeys = await this._index.minKeys(tmpQuery);

            // Remove keys that have been deleted or modified.
            sampleElement = TransactionIndex._sampleElement(backendKeys);
            const value = await this._backend.get(sampleElement);
            minIKey = sampleElement ? ObjectUtils.byKeyPath(value, this.keyPath) : undefined;
            backendKeys = backendKeys.difference(this._objectStore._removed);
            backendKeys = backendKeys.difference(this._objectStore._modified.keys());

            // If we get out of the range, stop here.
            if (minIKey && query !== null && !query.includes(minIKey)) {
                backendKeys = new Set();
                break;
            }
        }

        const newKeys = await InMemoryIndex.prototype.minKeys.call(this, query);

        if (backendKeys.size === 0) {
            return newKeys;
        } else if (newKeys.size === 0) {
            return backendKeys;
        }

        // Both contain elements, check which one is larger.
        const valueTx = await this._objectStore.get(TransactionIndex._sampleElement(newKeys));

        const iKeyBackend = minIKey;
        const iKeyTx = ObjectUtils.byKeyPath(valueTx, this.keyPath);

        if (iKeyBackend < iKeyTx) {
            return backendKeys;
        } else if (iKeyBackend > iKeyTx) {
            return newKeys;
        }
        return backendKeys.union(newKeys);
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
