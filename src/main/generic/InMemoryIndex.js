/**
 * @implements IIndex
 */
class InMemoryIndex {
    /**
     * @param {IObjectStore} objectStore
     * @param {string|Array.<string>} [keyPath]
     * @param {boolean} [multiEntry]
     * @param {boolean} [unique]
     * @param {BTree} [tree]
     */
    constructor(objectStore, keyPath, multiEntry=false, unique=false) {
        this._objectStore = objectStore;
        this._keyPath = keyPath;
        this._multiEntry = multiEntry;
        this._unique = unique;
        this._tree = new BTree();
    }

    /**
     * @returns {Promise}
     */
    async truncate() {
        this._tree = new BTree();
    }

    _indexKey(key, obj) {
        if (this.keyPath) {
            if (obj === undefined) return undefined;
            return ObjectUtils.byKeyPath(obj, this.keyPath);
        }
        return key;
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
     * @param {IBTree} [tree]
     */
    _insert(key, iKey, tree) {
        tree = tree || this._tree;
        if (!this._multiEntry || !Array.isArray(iKey)) {
            iKey = [iKey];
        }
        // Add all keys.
        for (const component of iKey) {
            if (tree.seek(component)) {
                if (this._unique) {
                    throw `Uniqueness constraint violated for key ${key} on path ${this._keyPath}`;
                }
                tree.currentRecord.add(key);
            } else {
                tree.insert(component, this._unique ? key : Set.from(key));
            }
        }
    }

    /**
     * @param {string} key
     * @param {*} value
     * @param {*} oldValue
     * @returns {TreeTransaction}
     */
    put(key, value, oldValue) {
        const treeTx = this._tree.transaction();
        const oldIKey = this._indexKey(key, oldValue);
        const newIKey = this._indexKey(key, value);

        if (oldIKey !== undefined) {
            this._remove(key, oldIKey, treeTx);
        }
        this._insert(key, newIKey, treeTx);
        return treeTx;
    }

    /**
     * @param {string} key
     * @param {*} oldValue
     * @returns {TreeTransaction}
     */
    remove(key, oldValue) {
        const treeTx = this._tree.transaction();
        if (oldValue !== undefined) {
            const iKey = this._indexKey(key, oldValue);
            this._remove(key, iKey, treeTx);
        }
        return treeTx;
    }

    /**
     * @param {string} key
     * @param {*} iKey
     * @param {IBTree} [tree]
     */
    _remove(key, iKey, tree) {
        tree = tree || this._tree;
        if (!this._multiEntry || !Array.isArray(iKey)) {
            iKey = [iKey];
        }
        // Remove all keys.
        for (const component of iKey) {
            if (tree.seek(component)) {
                if (!this._unique && tree.currentRecord.size > 1) {
                    tree.currentRecord.delete(key);
                } else {
                    tree.remove(component);
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
        const valuePromises = [];
        for (const key of keys) {
            valuePromises.push(this._objectStore.get(key));
        }
        return Promise.all(valuePromises);
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
                resultSet = Set.from(this._tree.currentRecord);
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

        while (!(query instanceof KeyRange) || query.includes(this._tree.currentKey)) {
            resultSet = resultSet.union(Set.from(this._tree.currentRecord));
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
        if (!this._tree.goToUpperBound(isRange ? query.upper : undefined, isRange ? query.upperOpen : false)) {
            return new Set();
        }
        return Set.from(this._tree.currentRecord);
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
        if (!this._tree.goToLowerBound(isRange ? query.lower : undefined, isRange ? query.lowerOpen : false)) {
            return new Set();
        }
        return Set.from(this._tree.currentRecord);
    }

    /**
     * @param {KeyRange|*} [query]
     * @returns {number}
     */
    async count(query=null) {
        return (await this.keys(query)).size;
        // The code below does only work for unique indices.
        // if (!(query instanceof KeyRange)) {
        //     return this._tree.length;
        // }
        // if (!this._tree.goToLowerBound(query.lower, query.lowerOpen)) {
        //     return 0;
        // }
        // const start = this._tree.keynum();
        // if (!this._tree.goToUpperBound(query.upper, query.upperOpen)) {
        //     return 0;
        // }
        // const end = this._tree.keynum();
        // return end - start + 1;
    }
}
Class.register(InMemoryIndex);

