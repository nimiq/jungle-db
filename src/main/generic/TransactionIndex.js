/**
 * This class constitutes an InMemoryIndex for Transactions.
 * It unifies the results of keys changed during the transaction
 * with the underlying backend.
 */
class TransactionIndex extends InMemoryIndex {
    /**
     * Derives the indices from the backend and returns a new map of transactions.
     * @param {Transaction} objectStore The transaction the index should be based on.
     * @param {IObjectStore} backend The backend underlying the transaction.
     * @returns {Map.<string,TransactionIndex>} A map containing all indices for the transaction.
     */
    static derive(objectStore, backend) {
        const indices = new Map();
        for (const [name, index] of backend.indices) {
            indices.set(name, new TransactionIndex(objectStore, backend, name, index.keyPath, index.multiEntry, index.unique));
        }
        return indices;
    }

    /** @type {IIndex} The index of the underlying backend. */
    get _index() {
        return this._backend.index(this._databaseDir);
    }

    /**
     * Constructs a new TransactionIndex serving the transaction's changes
     * and unifying the results with the underlying backend.
     * @param {Transaction} objectStore The transaction the index should be based on.
     * @param {IObjectStore} backend The backend underlying the transaction.
     * @param {string|Array.<string>} keyPath The key path of the indexed attribute.
     * @param {boolean} [multiEntry] Whether the indexed attribute is considered to be iterable or not.
     * @param {boolean} [unique] Whether there is a unique constraint on the attribute.
     * @protected
     */
    constructor(objectStore, backend, name, keyPath, multiEntry = false, unique = false) {
        super(objectStore, keyPath, multiEntry, unique);
        this._backend = backend;
        this._databaseDir = name;
    }

    async checkUniqueConstraint(key, value) {
        if (!this.unique) {
            return;
        }

        // Calculate secondary keys.
        let iKey = this._indexKey(key, value);
        if (iKey !== undefined) {
            if (!this.multiEntry || !Array.isArray(iKey)) {
                iKey = [iKey];
            }
            // Check whether they already exist.
            for (const secondaryKey of iKey) {
                const count = await this._index.count(KeyRange.only(secondaryKey));
                if (count > 0) {
                    throw new Error(`Uniqueness constraint violated for key ${secondaryKey} on path ${this._keyPath}`);
                }
            }
        }
    }

    /**
     * Returns a promise of a set of primary keys, whose associated objects' secondary keys are in the given range.
     * If the optional query is not given, it returns all primary keys in the index.
     * If the query is of type KeyRange, it returns all primary keys for which the secondary key is within this range.
     * @param {KeyRange} [query] Optional query to check the secondary keys against.
     * @param {number} [limit] Limits the number of results if given.
     * @returns {Promise.<Set.<string>>} A promise of the set of primary keys relevant to the query.
     */
    async keys(query = null, limit = null) {
        const promises = [];
        if (this._objectStore._truncated) {
            promises.push(new Set());
        } else {
            promises.push(this._index.keys(query, limit));
        }
        promises.push(InMemoryIndex.prototype.keys.call(this, query, limit));
        let [/** @type {Set} */ keys, /** @type {Set} */ newKeys] = await Promise.all(promises);
        // Remove keys that have been deleted or modified.
        keys = keys.difference(this._objectStore._removed);
        keys = keys.difference(this._objectStore._modified.keys());
        return keys.union(newKeys).limit(limit);
    }

    /**
     * Returns a promise of an array of objects whose secondary keys fulfill the given query.
     * If the optional query is not given, it returns all objects in the index.
     * If the query is of type KeyRange, it returns all objects whose secondary keys are within this range.
     * @param {KeyRange} [query] Optional query to check secondary keys against.
     * @param {number} [limit] Limits the number of results if given.
     * @returns {Promise.<Array.<*>>} A promise of the array of objects relevant to the query.
     */
    async values(query = null, limit = null) {
        const keys = await this.keys(query, limit);
        return InMemoryIndex.prototype._retrieveValues.call(this, keys);
    }

    /**
     * Returns a promise of an array of objects whose secondary key is maximal for the given range.
     * If the optional query is not given, it returns the objects whose secondary key is maximal within the index.
     * If the query is of type KeyRange, it returns the objects whose secondary key is maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Array.<*>>} A promise of array of objects relevant to the query.
     */
    async maxValues(query=null) {
        const keys = await this.maxKeys(query);
        return InMemoryIndex.prototype._retrieveValues.call(this, keys);
    }

    /**
     * Returns a promise of a set of primary keys, whose associated secondary keys are maximal for the given range.
     * If the optional query is not given, it returns the set of primary keys, whose associated secondary key is maximal within the index.
     * If the query is of type KeyRange, it returns the set of primary keys, whose associated secondary key is maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Set.<*>>} A promise of the key relevant to the query.
     */
    async maxKeys(query=null) {
        let backendKeys;
        if (this._objectStore._truncated) {
            backendKeys = new Set();
        } else {
            backendKeys = await this._index.maxKeys(query);
        }

        // Remove keys that have been deleted or modified.
        let sampleElement = Set.sampleElement(backendKeys);
        let value = undefined, maxIKey = undefined;
        if (sampleElement !== undefined) {
            value = await this._backend.get(sampleElement);
            maxIKey = ObjectUtils.byKeyPath(value, this.keyPath);
        }
        backendKeys = backendKeys.difference(this._objectStore._removed);
        backendKeys = backendKeys.difference(this._objectStore._modified.keys());

        while (sampleElement !== undefined && backendKeys.size === 0) {
            const tmpQuery = KeyRange.upperBound(maxIKey, true);
            backendKeys = await this._index.maxKeys(tmpQuery);

            // Remove keys that have been deleted or modified.
            sampleElement = Set.sampleElement(backendKeys);
            if (sampleElement !== undefined) {
                value = await this._backend.get(sampleElement);
                maxIKey = ObjectUtils.byKeyPath(value, this.keyPath);
            }
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
        const valueTx = await this._objectStore.get(Set.sampleElement(newKeys));

        const iKeyBackend = maxIKey;
        const iKeyTx = ObjectUtils.byKeyPath(valueTx, this.keyPath);

        if (ComparisonUtils.compare(iKeyBackend, iKeyTx) > 0) {
            return backendKeys;
        } else if (ComparisonUtils.compare(iKeyBackend, iKeyTx) < 0) {
            return newKeys;
        }
        return backendKeys.union(newKeys);
    }

    /**
     * Returns a promise of an array of objects whose secondary key is minimal for the given range.
     * If the optional query is not given, it returns the objects whose secondary key is minimal within the index.
     * If the query is of type KeyRange, it returns the objects whose secondary key is minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Array.<*>>} A promise of array of objects relevant to the query.
     */
    async minValues(query=null) {
        const keys = await this.minKeys(query);
        return InMemoryIndex.prototype._retrieveValues.call(this, keys);
    }

    /**
     * Returns a promise of a set of primary keys, whose associated secondary keys are minimal for the given range.
     * If the optional query is not given, it returns the set of primary keys, whose associated secondary key is minimal within the index.
     * If the query is of type KeyRange, it returns the set of primary keys, whose associated secondary key is minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Set.<*>>} A promise of the key relevant to the query.
     */
    async minKeys(query=null) {
        let backendKeys;
        if (this._objectStore._truncated) {
            backendKeys = new Set();
        } else {
            backendKeys = await this._index.minKeys(query);
        }

        // Remove keys that have been deleted or modified.
        let sampleElement = Set.sampleElement(backendKeys);
        let value = undefined, minIKey = undefined;
        if (sampleElement !== undefined) {
            value = await this._backend.get(sampleElement);
            minIKey = ObjectUtils.byKeyPath(value, this.keyPath);
        }
        backendKeys = backendKeys.difference(this._objectStore._removed);
        backendKeys = backendKeys.difference(this._objectStore._modified.keys());

        while (sampleElement !== undefined && backendKeys.size === 0) {
            const tmpQuery = KeyRange.lowerBound(minIKey, true);
            backendKeys = await this._index.minKeys(tmpQuery);

            // Remove keys that have been deleted or modified.
            sampleElement = Set.sampleElement(backendKeys);
            if (sampleElement !== undefined) {
                value = await this._backend.get(sampleElement);
                minIKey = ObjectUtils.byKeyPath(value, this.keyPath);
            }
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
        const valueTx = await this._objectStore.get(Set.sampleElement(newKeys));

        const iKeyBackend = minIKey;
        const iKeyTx = ObjectUtils.byKeyPath(valueTx, this.keyPath);

        if (ComparisonUtils.compare(iKeyBackend, iKeyTx) < 0) {
            return backendKeys;
        } else if (ComparisonUtils.compare(iKeyBackend, iKeyTx) > 0) {
            return newKeys;
        }
        return backendKeys.union(newKeys);
    }

    /**
     * Returns the count of entries, whose secondary key is in the given range.
     * If the optional query is not given, it returns the count of entries in the index.
     * If the query is of type KeyRange, it returns the count of entries, whose secondary key is within the given range.
     * @param {KeyRange} [query]
     * @returns {Promise.<number>}
     */
    async count(query=null) {
        // Unfortunately, we cannot do better than getting keys + counting.
        return (await this.keys(query)).size;
    }
}
Class.register(TransactionIndex);
