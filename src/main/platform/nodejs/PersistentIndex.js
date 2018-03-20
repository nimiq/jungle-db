/**
 * This class implements a persistent index for LevelDB.
 */
class PersistentIndex {
    /**
     * Creates a new PersistentIndex for a LevelDB backend.
     * @param {LevelDBBackend} objectStore The underlying LevelDB backend.
     * @param {JungleDB} db The underlying JungleDB.
     * @param {string} indexName The index name.
     * @param {string|Array.<string>} [keyPath] The key path of the indexed attribute.
     * If the keyPath is not given, this is a primary index.
     * @param {boolean} [multiEntry] Whether the indexed attribute is considered to be iterable or not.
     * @param {boolean} [unique] Whether there is a unique constraint on the attribute.
     */
    constructor(objectStore, db, indexName, keyPath, multiEntry=false, unique=false) {
        this._prefix = `_${objectStore.tableName}-${indexName}`;
        this._indexBackend = new LevelDBBackend(db, this._prefix);

        /** @type {LevelDBBackend} */
        this._objectStore = objectStore;
        this._indexName = indexName;
        this._keyPath = keyPath;
        this._multiEntry = multiEntry;
        this._unique = unique;
    }

    /** The levelDB backend. */
    get backend() {
        return this._indexBackend;
    }

    /**
     * Reinitialises the index.
     * @returns {Promise} The promise resolves after emptying the index.
     */
    truncate() {
        return this._indexBackend.truncate();
    }

    /**
     * Returns batch operations to reinitialise the index.
     * @returns {Promise.<Array>} The promise contains the batch operations.
     */
    async _truncate() {
        return LevelDBBackend._truncate(this._indexBackend._dbBackend);
    }

    /**
     * Closes the connection to the index database.
     * @returns {Promise} The promise resolves after closing the object store.
     */
    close() {
        return this._indexBackend.close();
    }

    /**
     * Fully deletes the database of the index.
     * @returns {Promise} The promise resolves after deleting the database.
     */
    destroy() {
        return this._indexBackend.destroy();
    }

    /**
     * Helper method to return the attribute associated with the key path if it exists.
     * @param {string} key The primary key of the key-value pair.
     * @param {*} obj The value of the key-value pair.
     * @returns {*} The attribute associated with the key path, if it exists, and undefined otherwise.
     * @private
     */
    _indexKey(key, obj) {
        if (this.keyPath) {
            if (obj === undefined) return undefined;
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
                pKeys = pKeys || [];
                pKeys.push(primaryKey);
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
                    pKeys.splice(pKeys.indexOf(primaryKey), 1);
                    await tx.put(secondaryKey, pKeys);
                } else {
                    await tx.remove(secondaryKey);
                }
            }
        }
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
        const internalTx = tx || new Transaction(null, this._indexBackend);
        const oldIKey = this._indexKey(key, oldValue);
        const newIKey = this._indexKey(key, value);

        if (oldIKey !== undefined) {
            await this._remove(key, oldIKey, internalTx);
        }
        if (newIKey !== undefined) {
            await this._insert(key, newIKey, internalTx);
        }
        return tx ? null : this._indexBackend.applyCombined(internalTx);
    }

    /**
     * Removes a key-value pair from the index.
     * @param {string} key The primary key of the pair.
     * @param {*} oldValue The old value of the pair. The indexed key will be extracted from this.
     * @param {Transaction} [tx] The transaction in which to track the changes.
     * @returns {Promise.<Transaction>}
     */
    async remove(key, oldValue, tx) {
        const internalTx = tx || new Transaction(null, this._indexBackend);

        if (oldValue !== undefined) {
            const iKey = this._indexKey(key, oldValue);
            await this._remove(key, iKey, internalTx);
        }
        return tx ? null : this._indexBackend.applyCombined(internalTx);
    }

    /**
     * A helper method to retrieve the values corresponding to a set of keys.
     * @param {Array.<string|Array.<string>>} results The set of keys to get the corresponding values for.
     * @returns {Promise.<Array.<*>>} A promise of the array of values.
     * @protected
     */
    async _retrieveValues(results) {
        const valuePromises = [];
        for (const key of this._retrieveKeys(results)) {
            valuePromises.push(this._objectStore.get(key));
        }
        return Promise.all(valuePromises);
    }

    /**
     * A helper method to retrieve the values corresponding to a set of keys.
     * @param {Array.<string|Array.<string>>} results The set of keys to get the corresponding values for.
     * @returns {Promise.<Array.<string>>} A promise of the array of values.
     * @protected
     */
    _retrieveKeys(results) {
        const keys = [];
        for (const result of results) {
            if (Array.isArray(result)) {
                for (const key of result) {
                    keys.push(key);
                }
            } else {
                keys.push(result);
            }
        }
        return keys;
    }

    /**
     * Initialises the persistent index by validating the version numbers
     * and loading the InMemoryIndex from the database.
     * @param {number} oldVersion
     * @param {number} newVersion
     * @param {boolean} isUpgrade
     * @returns {Promise.<PersistentIndex>} A promise of the fully initialised index.
     */
    async init(oldVersion, newVersion, isUpgrade) {
        await this._indexBackend.init(oldVersion, newVersion, GenericValueEncoding);

        // Initialise the index on first construction.
        if (isUpgrade) {
            const tx = new EncodedTransaction(this._indexBackend.tableName);
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
                            pKeys = pKeys || [];
                            pKeys.push(primaryKey);
                        }
                        tx.put(secondaryKey, pKeys);
                    }
                }
            });
            await this._indexBackend._apply(tx);
        }

        return this;
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
        const internalTx = new Transaction(null, this._indexBackend);

        if (tx._truncated) {
            await internalTx.truncate();
        }

        for (const key of tx._removed) {
            const oldValue = tx._originalValues.get(key);
            await this.remove(key, oldValue, internalTx);
        }
        for (const [key, value] of tx._modified) {
            const oldValue = tx._originalValues.get(key);
            await this.put(key, value, oldValue, internalTx);
        }

        return this._indexBackend.applyCombined(internalTx);
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
     * Returns a promise of an array of objects whose secondary keys fulfill the given query.
     * If the optional query is not given, it returns all objects in the index.
     * If the query is of type KeyRange, it returns all objects whose secondary keys are within this range.
     * @param {KeyRange} [query] Optional query to check secondary keys against.
     * @returns {Promise.<Array.<*>>} A promise of the array of objects relevant to the query.
     */
    async values(query=null) {
        const results = await this._indexBackend.values(query);
        return this._retrieveValues(values);
    }

    /**
     * Returns a promise of a set of primary keys, whose associated objects' secondary keys are in the given range.
     * If the optional query is not given, it returns all primary keys in the index.
     * If the query is of type KeyRange, it returns all primary keys for which the secondary key is within this range.
     * @param {KeyRange} [query] Optional query to check the secondary keys against.
     * @returns {Promise.<Set.<string>>} A promise of the set of primary keys relevant to the query.
     */
    async keys(query=null) {
        const results = await this._indexBackend.values(query);
        return Set.from(this._retrieveKeys(results));
    }

    /**
     * Returns a promise of an array of objects whose secondary key is maximal for the given range.
     * If the optional query is not given, it returns the objects whose secondary key is maximal within the index.
     * If the query is of type KeyRange, it returns the objects whose secondary key is maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Array.<*>>} A promise of array of objects relevant to the query.
     */
    async maxValues(query=null) {
        const result = await this._indexBackend.maxValue(query);
        return this._retrieveValues([result]);
    }

    /**
     * Returns a promise of a set of primary keys, whose associated secondary keys are maximal for the given range.
     * If the optional query is not given, it returns the set of primary keys, whose associated secondary key is maximal within the index.
     * If the query is of type KeyRange, it returns the set of primary keys, whose associated secondary key is maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Set.<*>>} A promise of the key relevant to the query.
     */
    async maxKeys(query=null) {
        return Set.from(await this._indexBackend.maxValue(query));
    }

    /**
     * Returns a promise of an array of objects whose secondary key is minimal for the given range.
     * If the optional query is not given, it returns the objects whose secondary key is minimal within the index.
     * If the query is of type KeyRange, it returns the objects whose secondary key is minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Array.<*>>} A promise of array of objects relevant to the query.
     */
    async minValues(query=null) {
        const result = await this._indexBackend.minValue(query);
        return this._retrieveValues([result]);
    }

    /**
     * Returns a promise of a set of primary keys, whose associated secondary keys are minimal for the given range.
     * If the optional query is not given, it returns the set of primary keys, whose associated secondary key is minimal within the index.
     * If the query is of type KeyRange, it returns the set of primary keys, whose associated secondary key is minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Set.<*>>} A promise of the key relevant to the query.
     */
    async minKeys(query=null) {
        return Set.from(await this._indexBackend.minValue(query));
    }

    /**
     * Returns the count of entries, whose secondary key is in the given range.
     * If the optional query is not given, it returns the count of entries in the index.
     * If the query is of type KeyRange, it returns the count of entries, whose secondary key is within the given range.
     * @param {KeyRange} [query]
     * @returns {Promise.<number>}
     */
    async count(query=null) {
        const results = await this._indexBackend.values(query);
        return this._retrieveKeys(results).length;
    }
}
Class.register(PersistentIndex);
