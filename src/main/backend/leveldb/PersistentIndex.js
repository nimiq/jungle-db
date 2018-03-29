/**
 * This class implements a persistent index for LevelDB.
 */
class PersistentIndex extends LevelDBBackend {
    /**
     * Creates a new PersistentIndex for a LevelDB backend.
     * @param {LevelDBBackend} objectStore The underlying LevelDB backend.
     * @param {JungleDB} db The underlying JungleDB.
     * @param {string} indexName The index name.
     * @param {string|Array.<string>} [keyPath] The key path of the indexed attribute.
     * If the keyPath is not given, this is a primary index.
     * @param {boolean} [multiEntry] Whether the indexed attribute is considered to be iterable or not.
     * @param {boolean} [unique] Whether there is a unique constraint on the attribute.
     * @param {ILevelDBEncoding} [keyEncoding] The key encoding for this index.
     */
    constructor(objectStore, db, indexName, keyPath, multiEntry = false, unique = false, keyEncoding = null) {
        const prefix = `_${objectStore.tableName}-${indexName}`;
        super(db, prefix, /*codec*/ undefined, { keyEncoding });
        this._prefix = prefix;

        /** @type {LevelDBBackend} */
        this._objectStore = objectStore;
        this._indexName = indexName;
        this._keyPath = keyPath;
        this._multiEntry = multiEntry;
        this._unique = unique;
    }

    /** The levelDB backend. */
    get backend() {
        return this;
    }

    /**
     * The name of the index.
     * @type {string}
     */
    get name() {
        return this._indexName;
    }

    /**
     * The key path associated with this index.
     * A key path is defined by a key within the object or alternatively a path through the object to a specific subkey.
     * For example, ['a', 'b'] could be used to use 'key' as the key in the following object:
     * { 'a': { 'b': 'key' } }
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
     * Initialises the persistent index by validating the version numbers
     * and loading the InMemoryIndex from the database.
     * @param {number} oldVersion
     * @param {number} newVersion
     * @param {?boolean|?function(oldVersion:number, newVersion:number):boolean} upgradeCondition
     * @returns {Promise.<PersistentIndex>} A promise of the fully initialised index.
     */
    async init(oldVersion, newVersion, upgradeCondition) {
        await LevelDBBackend.prototype.init.call(this, oldVersion, newVersion);

        let isUpgrade = true;
        if (upgradeCondition === null) {
            isUpgrade = (await this.maxKey()) === undefined; // Heuristic: empty index
        } else {
            isUpgrade = upgradeCondition === true || (typeof upgradeCondition === 'function' && upgradeCondition(oldVersion, newVersion));
        }

        // Initialise the index on first construction.
        if (isUpgrade) {
            const tx = new EncodedTransaction(this.tableName);
            await this._objectStore.valueStream((value, primaryKey) => {
                const keyPathValue = ObjectUtils.byKeyPath(value, this._keyPath);
                if (keyPathValue !== undefined) {
                    // Support for multi entry secondary key paths.
                    let iKeys = keyPathValue;
                    if (!this._multiEntry || !Array.isArray(iKeys)) {
                        iKeys = [iKeys];
                    }

                    for (const secondaryKey of iKeys) {
                        let pKeys = tx.get(secondaryKey);
                        if (this._unique) {
                            if (pKeys !== undefined) {
                                throw new Error(`Uniqueness constraint violated for key ${secondaryKey} on path ${this._keyPath}`);
                            }
                            pKeys = primaryKey;
                        } else {
                            pKeys = new SortedList((pKeys || []), ComparisonUtils.compare);
                            pKeys.add(primaryKey);
                            pKeys = pKeys.values();
                        }
                        tx.put(secondaryKey, pKeys);
                    }
                }
            });
            await LevelDBBackend.prototype._apply.call(this, tx);
        }

        return this;
    }

    /**
     * Inserts a new key-value pair into the index.
     * For replacing an existing pair, the old value has to be passed as well.
     * @param {string} key The primary key of the pair.
     * @param {*} value The value of the pair. The indexed key will be extracted from this.
     * @param {*} [oldValue] The old value associated with the primary key.
     * @param {Transaction} [tx] The transaction in which to track the changes.
     * @returns {Promise.<?Array>}
     */
    async put(key, value, oldValue, tx) {
        const internalTx = tx || new Transaction(null, this, this, false);
        const oldIKey = this._indexKey(key, oldValue);
        const newIKey = this._indexKey(key, value);

        // Only update index on changes.
        if (!ComparisonUtils.equals(oldIKey, newIKey)) {
            if (oldIKey !== undefined) {
                await this._remove(key, oldIKey, internalTx);
            }
            if (newIKey !== undefined) {
                await this._insert(key, newIKey, internalTx);
            }
        }
        return tx ? null : this.applyCombined(internalTx);
    }

    /**
     * Removes a key-value pair from the index.
     * @param {string} key The primary key of the pair.
     * @param {*} oldValue The old value of the pair. The indexed key will be extracted from this.
     * @param {Transaction} [tx] The transaction in which to track the changes.
     * @returns {Promise.<Transaction>}
     */
    async remove(key, oldValue, tx) {
        const internalTx = tx || new Transaction(null, this, this, false);

        const iKey = this._indexKey(key, oldValue);
        if (iKey !== undefined) {
            await this._remove(key, iKey, internalTx);
        }
        return tx ? null : this.applyCombined(internalTx);
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
        const results = await LevelDBBackend.prototype.values.call(this, query, limit);
        return this._retrieveValues(results, limit);
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
        const results = await LevelDBBackend.prototype.values.call(this, query, limit);
        return Set.from(this._retrieveKeys(results, limit));
    }

    /**
     * Returns a promise of an array of objects whose secondary key is maximal for the given range.
     * If the optional query is not given, it returns the objects whose secondary key is maximal within the index.
     * If the query is of type KeyRange, it returns the objects whose secondary key is maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Array.<*>>} A promise of array of objects relevant to the query.
     */
    async maxValues(query=null) {
        const results = await this.maxValue(query);
        return this._retrieveValues([results]);
    }

    /**
     * Returns a promise of a set of primary keys, whose associated secondary keys are maximal for the given range.
     * If the optional query is not given, it returns the set of primary keys, whose associated secondary key is maximal within the index.
     * If the query is of type KeyRange, it returns the set of primary keys, whose associated secondary key is maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Set.<*>>} A promise of the key relevant to the query.
     */
    async maxKeys(query=null) {
        return Set.from(await this.maxValue(query));
    }

    /**
     * Returns a promise of an array of objects whose secondary key is minimal for the given range.
     * If the optional query is not given, it returns the objects whose secondary key is minimal within the index.
     * If the query is of type KeyRange, it returns the objects whose secondary key is minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Array.<*>>} A promise of array of objects relevant to the query.
     */
    async minValues(query=null) {
        const results = await this.minValue(query);
        return this._retrieveValues([results]);
    }

    /**
     * Returns a promise of a set of primary keys, whose associated secondary keys are minimal for the given range.
     * If the optional query is not given, it returns the set of primary keys, whose associated secondary key is minimal within the index.
     * If the query is of type KeyRange, it returns the set of primary keys, whose associated secondary key is minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Set.<*>>} A promise of the key relevant to the query.
     */
    async minKeys(query=null) {
        return Set.from(await this.minValue(query));
    }

    /**
     * Returns the count of entries, whose secondary key is in the given range.
     * If the optional query is not given, it returns the count of entries in the index.
     * If the query is of type KeyRange, it returns the count of entries, whose secondary key is within the given range.
     * @param {KeyRange} [query]
     * @returns {Promise.<number>}
     */
    async count(query=null) {
        const results = await LevelDBBackend.prototype.values.call(this, query);
        return this._retrieveKeys(results).length;
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
     * A helper method to insert a primary-secondary key pair into the tree.
     * @param {string} primaryKey The primary key.
     * @param {*} iKeys The indexed key.
     * @param {Transaction} tx The transaction in which to track the changes.
     * @throws if the uniqueness constraint is violated.
     */
    async _insert(primaryKey, iKeys, tx) {
        if (!this._multiEntry || !Array.isArray(iKeys)) {
            iKeys = [iKeys];
        }

        for (const secondaryKey of iKeys) {
            let pKeys = await tx.get(secondaryKey);
            if (this._unique) {
                if (pKeys !== undefined) {
                    throw new Error(`Uniqueness constraint violated for key ${secondaryKey} on path ${this._keyPath}`);
                }
                pKeys = primaryKey;
            } else {
                pKeys = new SortedList((pKeys || []), ComparisonUtils.compare);
                if (!pKeys.has(primaryKey)) {
                    pKeys.add(primaryKey);
                }
                pKeys = pKeys.values(); // Convert to list
            }
            await tx.put(secondaryKey, pKeys);
        }
    }

    /**
     * A helper method to remove a primary-secondary key pair from the tree.
     * @param {string} primaryKey The primary key.
     * @param {*} iKeys The indexed key.
     * @param {Transaction} tx The transaction in which to track the changes.
     */
    async _remove(primaryKey, iKeys, tx) {
        if (!this._multiEntry || !Array.isArray(iKeys)) {
            iKeys = [iKeys];
        }
        // Remove all keys.
        for (const secondaryKey of iKeys) {
            let pKeys = await tx.get(secondaryKey);
            if (pKeys) {
                if (!this._unique && pKeys.length > 1) {
                    pKeys = new SortedList(pKeys, ComparisonUtils.compare);
                    pKeys.remove(primaryKey);
                    await tx.put(secondaryKey, pKeys.values());
                } else {
                    await tx.remove(secondaryKey);
                }
            }
        }
    }

    /**
     * A helper method to retrieve the values corresponding to a set of keys.
     * @param {Array.<string|Array.<string>>} results The set of keys to get the corresponding values for.
     * @param {number} [limit] Limits the number of results if given.
     * @returns {Promise.<Array.<*>>} A promise of the array of values.
     * @protected
     */
    async _retrieveValues(results, limit = null) {
        const valuePromises = [];
        for (const key of this._retrieveKeys(results, limit)) {
            valuePromises.push(this._objectStore.get(key));
        }
        return Promise.all(valuePromises);
    }

    /**
     * A helper method to retrieve the values corresponding to a set of keys.
     * @param {Array.<string|Array.<string>>} results The set of keys to get the corresponding values for.
     * @param {number} [limit] Limits the number of results if given.
     * @returns {Array.<string>} A promise of the array of values.
     * @protected
     */
    _retrieveKeys(results, limit = null) {
        const keys = [];
        for (const result of results) {
            if (Array.isArray(result)) {
                for (const key of result) {
                    if (limit !== null && keys.length >= limit) return keys;
                    keys.push(key);
                }
            } else {
                if (limit !== null && keys.length >= limit) return keys;
                keys.push(result);
            }
        }
        return keys;
    }

    /**
     * Internally applies a transaction to the store's state.
     * This needs to be done in batch (as a db level transaction), i.e., either the full state is updated
     * or no changes are applied.
     * @param {Transaction} tx The transaction to apply.
     * @returns {Promise.<Array>} The promise resolves after applying the transaction.
     * @protected
     */
    async _apply(tx) {
        const internalTx = new Transaction(null, this, this, false);

        if (tx._truncated) {
            await internalTx.truncate();
        }

        for (const key of tx._removed) {
            const oldValue = await this._objectStore.get(key);
            await this.remove(key, oldValue, internalTx);
        }
        for (const [key, value] of tx._modified) {
            const oldValue = await this._objectStore.get(key);
            await this.put(key, value, oldValue, internalTx);
        }

        return this.applyCombined(internalTx);
    }
}
Class.register(PersistentIndex);
