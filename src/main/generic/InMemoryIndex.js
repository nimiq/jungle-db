/**
 * This is a BTree based index, which is generally stored in memory.
 * It is used by transactions.
 * @implements {IIndex}
 */
class InMemoryIndex {
    /**
     * Creates a new InMemoryIndex for a given object store.
     * The key path describes the path of the secondary key within the stored objects.
     * Only objects for which the key path exists are part of the secondary index.
     *
     * A key path is defined by a key within the object or alternatively a path through the object to a specific subkey.
     * For example, ['a', 'b'] could be used to use 'key' as the key in the following object:
     * { 'a': { 'b': 'key' } }
     *
     * If a secondary index is a multi entry index, and the value at the key path is iterable,
     * every item of the iterable value will be associated with the object.
     * @param {IObjectStore} objectStore The underlying object store to use.
     * @param {string|Array.<string>} [keyPath] The key path of the indexed attribute.
     * If the keyPath is not given, this is a primary index.
     * @param {boolean} [multiEntry] Whether the indexed attribute is considered to be iterable or not.
     * @param {boolean} [unique] Whether there is a unique constraint on the attribute.
     */
    constructor(objectStore, keyPath, multiEntry=false, unique=false) {
        this._objectStore = objectStore;
        this._keyPath = keyPath;
        this._multiEntry = multiEntry;
        this._unique = unique;
        this._tree = new BTree();
    }

    /**
     * Reinitialises the index.
     */
    truncate() {
        this._tree = new BTree();
    }

    /**
     * Helper method to return the attribute associated with the key path if it exists.
     * @param {string} key The primary key of the key-value pair.
     * @param {*} obj The value of the key-value pair.
     * @returns {*} The attribute associated with the key path, if it exists, and undefined otherwise.
     * @private
     */
    _indexKey(key, obj) {
        if (obj === undefined) return undefined;
        if (this.keyPath) {
            return ObjectUtils.byKeyPath(obj, this.keyPath);
        }
        return key;
    }

    /**
     * The key path associated with this index.
     * A key path is defined by a key within the object or alternatively a path through the object to a specific subkey.
     * For example, ['a', 'b'] could be used to use 'key' as the key in the following object:
     * { 'a': { 'b': 'key' } }
     * If the keyPath is undefined, this index uses the primary key of the key-value store.
     * @type {string|Array.<string>}
     */
    get keyPath() {
        return this._keyPath;
    }

    /**
     * This value determines whether the index supports multiple secondary keys per entry.
     * If so, the value at the key path is considered to be an iterable.
     * @type {boolean}
     */
    get multiEntry() {
        return this._multiEntry;
    }

    /**
     * This value determines whether the index is a unique constraint.
     * @type {boolean}
     */
    get unique() {
        return this._unique;
    }

    /**
     * A helper method to insert a primary-secondary key pair into the tree.
     * @param {string} key The primary key.
     * @param {*} iKey The indexed key.
     * @throws if the uniqueness constraint is violated.
     */
    _insert(key, iKey) {
        const tree = this._tree;
        if (!this._multiEntry || !Array.isArray(iKey)) {
            iKey = [iKey];
        }
        // Add all keys.
        for (const component of iKey) {
            if (tree.seek(component)) {
                if (this._unique) {
                    throw new Error(`Uniqueness constraint violated for key ${key} on path ${this._keyPath}`);
                }
                (/** @type {SortedList} */ tree.currentRecord).add(key);
            } else {
                tree.insert(component, this._unique ? key : new SortedList([key], ComparisonUtils.compare));
            }
        }
    }

    /**
     * Inserts a new key-value pair into the index.
     * For replacing an existing pair, the old value has to be passed as well.
     * @param {string} key The primary key of the pair.
     * @param {*} value The value of the pair. The indexed key will be extracted from this.
     * @param {*} [oldValue] The old value associated with the primary key.
     */
    put(key, value, oldValue) {
        const oldIKey = this._indexKey(key, oldValue);
        const newIKey = this._indexKey(key, value);

        if (oldIKey !== newIKey) {
            if (oldIKey !== undefined) {
                this._remove(key, oldIKey);
            }
            if (newIKey !== undefined) {
                this._insert(key, newIKey);
            }
        }
    }

    /**
     * Removes a key-value pair from the index.
     * @param {string} key The primary key of the pair.
     * @param {*} oldValue The old value of the pair. The indexed key will be extracted from this.
     */
    remove(key, oldValue) {
        const iKey = this._indexKey(key, oldValue);
        if (iKey !== undefined) {
            this._remove(key, iKey);
        }
    }

    /**
     * A helper method to remove a primary-secondary key pair from the tree.
     * @param {string} key The primary key.
     * @param {*} iKey The indexed key.
     */
    _remove(key, iKey) {
        const tree = this._tree;
        if (!this._multiEntry || !Array.isArray(iKey)) {
            iKey = [iKey];
        }
        // Remove all keys.
        for (const component of iKey) {
            if (tree.seek(component)) {
                if (!this._unique && (/** @type {SortedList} */ tree.currentRecord).length > 1) {
                    (/** @type {SortedList} */ tree.currentRecord).remove(key);
                } else {
                    tree.remove(component);
                }
            }
        }
    }

    /**
     * A helper method to retrieve the values corresponding to a set of keys.
     * @param {Set.<string>} keys The set of keys to get the corresponding values for.
     * @returns {Promise.<Array.<*>>} A promise of the array of values.
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
     * Returns a promise of an array of objects whose secondary keys fulfill the given query.
     * If the optional query is not given, it returns all objects in the index.
     * If the query is of type KeyRange, it returns all objects whose secondary keys are within this range.
     * @param {KeyRange} [query] Optional query to check secondary keys against.
     * @param {number} [limit] Limits the number of results if given.
     * @returns {Promise.<Array.<*>>} A promise of the array of objects relevant to the query.
     */
    async values(query = null, limit = null) {
        const keys = await this.keys(query, limit);
        return this._retrieveValues(keys);
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
        let resultSet = new Set();

        // Shortcut for exact match.
        if (query instanceof KeyRange && query.exactMatch) {
            if (this._tree.seek(query.lower)) {
                resultSet = Set.from(this._tree.currentRecord);
            }
            return resultSet.limit(limit);
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
            // Limit
            if (limit !== null && resultSet.size >= limit) {
                break;
            }

            resultSet = resultSet.union(Set.from(this._tree.currentRecord));
            if (!this._tree.skip()) {
                break;
            }
        }
        return resultSet.limit(limit);
    }

    /**
     * Iterates over the keys in a given range and direction.
     * The callback is called for each primary key fulfilling the query
     * until it returns false and stops the iteration.
     * @param {function(key:string):boolean} callback A predicate called for each key until returning false.
     * @param {boolean} ascending Determines the direction of traversal.
     * @param {KeyRange} query An optional KeyRange to narrow down the iteration space.
     * @returns {Promise} The promise resolves after all elements have been streamed.
     */
    keyStream(callback, ascending=true, query=null) {
        if (!this._unique) {
            throw new Error('Unsupported operation for non-unique indices');
        }

        // Find lower bound and start from there.
        if (!(query instanceof KeyRange)) {
            if (ascending) {
                this._tree.goTop();
            } else {
                this._tree.goBottom();
            }
        } else {
            if (ascending) {
                if (!this._tree.goToLowerBound(query.lower, query.lowerOpen)) {
                    return Promise.resolve();
                }
            } else {
                if (!this._tree.goToUpperBound(query.upper, query.upperOpen)) {
                    return Promise.resolve();
                }
            }
        }

        while (!(query instanceof KeyRange) || query.includes(this._tree.currentKey)) {
            if (!callback(this._tree.currentRecord)) {
                break;
            }
            if (!this._tree.skip(ascending ? 1 : -1)) {
                break;
            }
        }
        return Promise.resolve();
    }

    /**
     * Iterates over the keys and values in a given range and direction.
     * The callback is called for each value and primary key fulfilling the query
     * until it returns false and stops the iteration.
     * @param {function(value:*, key:string):boolean} callback A predicate called for each value and key until returning false.
     * @param {boolean} ascending Determines the direction of traversal.
     * @param {KeyRange} query An optional KeyRange to narrow down the iteration space.
     * @returns {Promise} The promise resolved after all elements have been streamed.
     */
    async valueStream(callback, ascending=true, query=null) {
        if (!this._unique) {
            throw new Error('Unsupported operation for non-unique indices');
        }

        // Find lower bound and start from there.
        if (!(query instanceof KeyRange)) {
            if (ascending) {
                this._tree.goTop();
            } else {
                this._tree.goBottom();
            }
        } else {
            if (ascending) {
                if (!this._tree.goToLowerBound(query.lower, query.lowerOpen)) {
                    return;
                }
            } else {
                if (!this._tree.goToUpperBound(query.upper, query.upperOpen)) {
                    return;
                }
            }
        }

        while (!(query instanceof KeyRange) || query.includes(this._tree.currentKey)) {
            if (!callback(await this._objectStore.get(this._tree.currentRecord), this._tree.currentRecord)) {
                break;
            }
            if (!this._tree.skip(ascending ? 1 : -1)) {
                break;
            }
        }
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
        return this._retrieveValues(keys);
    }

    /**
     * Returns a promise of a set of primary keys, whose associated secondary keys are maximal for the given range.
     * If the optional query is not given, it returns the set of primary keys, whose associated secondary key is maximal within the index.
     * If the query is of type KeyRange, it returns the set of primary keys, whose associated secondary key is maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Set.<*>>} A promise of the key relevant to the query.
     */
    async maxKeys(query=null) {
        const isRange = query instanceof KeyRange;
        if (!this._tree.goToUpperBound(isRange ? query.upper : undefined, isRange ? query.upperOpen : false)) {
            return new Set();
        }
        return Set.from(this._tree.currentRecord);
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
        return this._retrieveValues(keys);
    }

    /**
     * Returns a promise of a set of primary keys, whose associated secondary keys are minimal for the given range.
     * If the optional query is not given, it returns the set of primary keys, whose associated secondary key is minimal within the index.
     * If the query is of type KeyRange, it returns the set of primary keys, whose associated secondary key is minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Set.<*>>} A promise of the key relevant to the query.
     */
    async minKeys(query=null) {
        const isRange = query instanceof KeyRange;
        if (!this._tree.goToLowerBound(isRange ? query.lower : undefined, isRange ? query.lowerOpen : false)) {
            return new Set();
        }
        return Set.from(this._tree.currentRecord);
    }

    /**
     * Returns the count of entries, whose secondary key is in the given range.
     * If the optional query is not given, it returns the count of entries in the index.
     * If the query is of type KeyRange, it returns the count of entries, whose secondary key is within the given range.
     * @param {KeyRange} [query]
     * @returns {Promise.<number>}
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

