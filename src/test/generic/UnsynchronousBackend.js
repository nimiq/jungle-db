/**
 * This is an intermediate layer caching the results of a backend.
 * While simple get/put queries make use of the cache,
 * more advanced queries will be forwarded to the backend.
 * @implements {IBackend}
 */
class UnsynchronousBackend {
    /**
     * Creates a new instance of the cached layer using the specified backend.
     * @param {IBackend} backend The backend to use.
     */
    constructor(backend) {
        this._backend = backend;
    }

    /** @type {boolean} */
    get connected() {
        return this._backend.connected;
    }

    /**
     * A map of index names to indices as defined by the underlying backend.
     * The index names can be used to access an index.
     * @type {Map.<string,IIndex>}
     */
    get indices() {
        return this._backend.indices;
    }

    /**
     * Returns a promise of the object stored under the given primary key.
     * If the item is in the cache, the cached value will be returned.
     * Otherwise, the value will be fetched from the backend object store..
     * Resolves to undefined if the key is not present in the object store.
     * @param {string} key The primary key to look for.
     * @returns {Promise.<*>} A promise of the object stored under the given key, or undefined if not present.
     */
    get(key) {
        return this._backend.get(key);
    }

    /**
     * Inserts or replaces a key-value pair.
     * Stores the new key-value pair in both the cache and the backend.
     * @param {string} key The primary key to associate the value with.
     * @param {*} value The value to write.
     * @returns {Promise} The promise resolves after writing to the current object store finished.
     */
    put(key, value) {
        return this._backend.put(key, value);
    }

    /**
     * Removes the key-value pair of the given key from the cache and the backend.
     * @param {string} key The primary key to delete along with the associated object.
     * @returns {Promise} The promise resolves after writing to the current object store finished.
     */
    remove(key) {
        return this._backend.remove(key);
    }

    /**
     * Returns a promise of a set of keys fulfilling the given query by querying the backend.
     * If the optional query is not given, it returns all keys in the object store.
     * If the query is of type KeyRange, it returns all keys of the object store being within this range.
     * If the query is of type Query, it returns all keys fulfilling the query.
     * @param {Query|KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Set.<string>>} A promise of the set of keys relevant to the query.
     */
    keys(query=null) {
        return this._backend.keys(query);
    }

    /**
     * Returns a promise of an array of objects whose primary keys fulfill the given query by relying on the backend.
     * If the optional query is not given, it returns all objects in the object store.
     * If the query is of type KeyRange, it returns all objects whose primary keys are within this range.
     * If the query is of type Query, it returns all objects whose primary keys fulfill the query.
     * @param {Query|KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Array.<*>>} A promise of the array of objects relevant to the query.
     */
    values(query=null) {
        return this._backend.values(query);
    }

    /**
     * Iterates over the keys in a given range and direction.
     * The callback is called for each primary key fulfilling the query
     * until it returns false and stops the iteration.
     * @param {function(key:string):boolean} callback A predicate called for each key until returning false.
     * @param {boolean} ascending Determines the direction of traversal.
     * @param {KeyRange} query An optional KeyRange to narrow down the iteration space.
     */
    keyStream(callback, ascending=true, query=null) {
        return this._backend.keyStream(callback, ascending, query);
    }

    /**
     * Iterates over the keys and values in a given range and direction.
     * The callback is called for each value and primary key fulfilling the query
     * until it returns false and stops the iteration.
     * @param {function(value:*, key:string):boolean} callback A predicate called for each value and key until returning false.
     * @param {boolean} ascending Determines the direction of traversal.
     * @param {KeyRange} query An optional KeyRange to narrow down the iteration space.
     */
    valueStream(callback, ascending=true, query=null) {
        return this._backend.valueStream(callback, ascending, query);
    }

    /**
     * Returns a promise of the object whose primary key is maximal for the given range.
     * If the optional query is not given, it returns the object whose key is maximal.
     * If the query is of type KeyRange, it returns the object whose primary key is maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<*>} A promise of the object relevant to the query.
     */
    maxValue(query=null) {
        return this._backend.maxValue(query);
    }

    /**
     * Returns a promise of the key being maximal for the given range.
     * If the optional query is not given, it returns the maximal key.
     * If the query is of type KeyRange, it returns the key being maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<string>} A promise of the key relevant to the query.
     */
    maxKey(query=null) {
        return this._backend.maxKey(query);
    }

    /**
     * Returns a promise of the key being minimal for the given range.
     * If the optional query is not given, it returns the minimal key.
     * If the query is of type KeyRange, it returns the key being minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<string>} A promise of the key relevant to the query.
     */
    minKey(query=null) {
        return this._backend.minKey(query);
    }

    /**
     * Returns a promise of the object whose primary key is minimal for the given range.
     * If the optional query is not given, it returns the object whose key is minimal.
     * If the query is of type KeyRange, it returns the object whose primary key is minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<*>} A promise of the object relevant to the query.
     */
    minValue(query=null) {
        return this._backend.minValue(query);
    }

    /**
     * Returns the count of entries in the given range.
     * If the optional query is not given, it returns the count of entries in the object store.
     * If the query is of type KeyRange, it returns the count of entries within the given range.
     * @param {KeyRange} [query]
     * @returns {Promise.<number>}
     */
    count(query=null) {
        return this._backend.count(query);
    }

    /**
     * Unsupported operation for a cached backend.
     * @param {Transaction} [tx]
     * @returns {Promise.<boolean>}
     */
    async commit(tx) {
        throw new Error('Unsupported operation');
    }

    /**
     * Unsupported operation for a cached backend.
     * @param {Transaction} [tx]
     */
    async abort(tx) {
        throw new Error('Unsupported operation');
    }

    /**
     * Internally applies a transaction to the cache's and backend's state.
     * This needs to be done in batch (as a db level transaction), i.e., either the full state is updated
     * or no changes are applied.
     * @param {Transaction} tx The transaction to apply.
     * @returns {Promise} The promise resolves after applying the transaction.
     * @protected
     */
    _apply(tx) {
        return this._backend._apply(tx);
    }

    /**
     * Empties the object store.
     * @returns {Promise} The promise resolves after emptying the object store.
     */
    async truncate() {
        return this._backend.truncate();
    }

    /**
     * Returns the index of the given name.
     * If the index does not exist, it returns undefined.
     * @param {string} indexName The name of the requested index.
     * @returns {IIndex} The index associated with the given name.
     */
    index(indexName) {
        return this._backend.index(indexName);
    }

    /**
     * Creates a new secondary index on the object store.
     * Currently, all secondary indices are non-unique.
     * They are defined by a key within the object or alternatively a path through the object to a specific subkey.
     * For example, ['a', 'b'] could be used to use 'key' as the key in the following object:
     * { 'a': { 'b': 'key' } }
     * Secondary indices may be multiEntry, i.e., if the keyPath resolves to an iterable object, each item within can
     * be used to find this entry.
     * If a new object does not possess the key path associated with that index, it is simply ignored.
     *
     * This function may only be called before the database is connected.
     * Moreover, it is only executed on database version updates or on first creation.
     * @param {string} indexName The name of the index.
     * @param {string|Array.<string>} [keyPath] The path to the key within the object. May be an array for multiple levels.
     * @param {{multiEntry:?boolean, unique:?boolean, upgradeCondition:?boolean|?function(oldVersion:number, newVersion:number):boolean}|boolean} [options] An options object (for deprecated usage: multiEntry boolean).
     */
    createIndex(indexName, keyPath, options=false) {
        return this._backend.createIndex(indexName, keyPath, options);
    }

    /**
     * Deletes a secondary index from the object store.
     * @param indexName
     * @param {{upgradeCondition:?boolean|?function(oldVersion:number, newVersion:number):boolean}} [options]
     */
    deleteIndex(indexName, options={}) {
        return this._backend.deleteIndex(indexName, options);
    }

    /**
     * Closes the object store and potential connections.
     * @returns {Promise} The promise resolves after closing the object store.
     */
    close() {
        return this._backend.close();
    }

    /**
     * Creates a new transaction, ensuring read isolation
     * on the most recently successfully committed state.
     * @returns {Transaction} The transaction object.
     */
    transaction() {
        throw new Error('Unsupported operation');
    }

    /**
     * Returns the necessary information in order to flush a combined transaction.
     * @abstract
     * @param {Transaction} tx The transaction that should be applied to this backend.
     * @returns {Promise.<*|function()|Array.<*|function()>>} For non-persistent backends: a function that effectively applies the transaction.
     * Native backends otherwise specify their own information as needed by their JungleDB instance.
     */
    applyCombined(tx) {
        return this._backend.applyCombined(tx);
    }

    /**
     * Checks whether an object store implements the ISynchronousObjectStore interface.
     * @returns {boolean} The transaction object.
     */
    isSynchronous() {
        return false;
    }
}
Class.register(UnsynchronousBackend);
