/**
 * @implements IIndex
 */
class InMemoryIndex {
    /**
     * @param {IObjectStore} objectStore
     * @param {string|Array.<string>} keyPath
     * @param {boolean} multiEntry
     */
    constructor(objectStore, keyPath, multiEntry=false) {
        this._objectStore = objectStore;
        this._keyPath = keyPath;
        this._multiEntry = multiEntry;
        this._tree = new BTree();
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
     * @param {string} key
     * @param {*} iKey
     */
    _insert(key, iKey) {
        if (!this._multiEntry || !Array.isArray(iKey)) {
            iKey = [iKey];
        }
        // Add all keys.
        for (const component of iKey) {
            if (this._tree.seek(component)) {
                this._tree.records.add(key);
            } else {
                this._tree.insert(component, new Set([key]));
            }
        }
    }

    /**
     * @param {string} key
     * @param {*} oldObj
     * @param {*} newObj
     */
    put(key, oldObj, newObj) {
        const oldIKey = (oldObj !== undefined) ? ObjectUtils.byKeyPath(oldObj, this._keyPath) : undefined;
        const newIKey = ObjectUtils.byKeyPath(newObj, this._keyPath);
        if (oldIKey === newIKey) return;

        if (oldIKey !== undefined) {
            this._remove(key, oldIKey);
        }
        this._insert(key, newIKey);
    }

    /**
     * @param {string} key
     * @param {*} obj
     */
    remove(key, obj) {
        if (obj !== undefined) {
            const iKey = ObjectUtils.byKeyPath(obj, this._keyPath);
            this._remove(key, iKey);
        }
    }

    /**
     * @param {string} key
     * @param {*} iKey
     */
    _remove(key, iKey) {
        if (!this._multiEntry || !Array.isArray(iKey)) {
            iKey = [iKey];
        }
        // Remove all keys.
        for (const component of iKey) {
            if (this._tree.seek(component)) {
                if (this._tree.records.size > 1) {
                    this._tree.records.delete(key);
                } else {
                    this._tree.remove(component);
                }
            }
        }
    }

    /**
     * @param {Set.<string>} keys
     * @returns {Promise.<Array.<*>>}
     * @protected
     */
    async _retrieveValues(keys) {
        const values = [];
        for (const key of keys) {
            values.push(await this._objectStore.get(key));
        }
        return values;
    }

    /**
     * @param {KeyRange|*} [query]
     * @returns {Promise.<Array.<*>>}
     */
    async values(query=null) {
        const keys = this.keys(query);
        return this._retrieveValues(keys);
    }

    /**
     * @param {KeyRange|*} [query]
     * @returns {Set.<string>}
     */
    async keys(query=null) {
        let resultSet = new Set();

        // Shortcut for exact match.
        if (query instanceof  KeyRange && query.exactMatch) {
            if (this._tree.seek(query.lower)) {
                resultSet = new Set(this._tree.records);
            }
            return resultSet;
        }

        // Find lower bound and start from there.
        if (!(query instanceof KeyRange)) {
            this._tree.goTop();
        } else {
            if (!this._tree.goToLowerBound(query.lower, query.lowerOpen)) {
                return resultSet; // empty
            }
        }

        while (!(query instanceof KeyRange) || query.includes(this._tree.key)) {
            resultSet = resultSet.union(this._tree.records);
            this._tree.skip();
        }
        return resultSet;
    }

    /**
     * @param {KeyRange|*} [query]
     * @returns {Promise.<Array.<*>>}
     */
    async maxValues(query=null) {
        const keys = await this.maxKeys(query);
        return this._retrieveValues(keys);
    }

    /**
     * @param {KeyRange|*} [query]
     * @returns {Promise.<Set.<string>>}
     */
    async maxKeys(query=null) {
        const isRange = query instanceof KeyRange;
        this._tree.goToUpperBound(isRange ? query.upper : undefined, query.upperOpen || false);
        return new Set(this._tree.records);
    }

    /**
     * @param {KeyRange|*} [query]
     * @returns {Promise.<Array.<*>>}
     */
    async minValues(query=null) {
        const keys = await this.minKeys(query);
        return this._retrieveValues(keys);
    }

    /**
     * @param {KeyRange|*} [query]
     * @returns {Promise.<Set.<string>>}
     */
    async minKeys(query=null) {
        const isRange = query instanceof KeyRange;
        this._tree.goToLowerBound(isRange ? query.lower : undefined, query.lowerOpen || false);
        return new Set(this._tree.records);
    }

    /**
     * @param {KeyRange|*} [query]
     * @returns {number}
     */
    count(query=null) {
        if (!(query instanceof KeyRange)) {
            return this._tree.length;
        }
        if (!this._tree.goToLowerBound(query.lower, query.lowerOpen)) {
            return 0;
        }
        const start = this._tree.keynum();
        if (!this._tree.goToUpperBound(query.upper, query.upperOpen)) {
            return 0;
        }
        const end = this._tree.keynum();
        return end - start + 1;
    }
}
Class.register(InMemoryIndex);

