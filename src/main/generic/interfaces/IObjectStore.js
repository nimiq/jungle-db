/**
 * This interface represents an object store (roughly corresponding to a table in a relational database).
 * It stores key-value pairs where the key is generally considered to be a string and the value is any object.
 * The key is the entry's primary key. Other keys within the object may be accessed by indices as offered by the store.
 * @interface
 */
class IObjectStore {
    /**
     * A map of index names to indices.
     * The index names can be used to access an index.
     * @abstract
     * @type {Map.<string,IIndex>}
     */
    get indices() {} // eslint-disable-line no-unused-vars

    /**
     * Returns a promise of the object stored under the given primary key.
     * Resolves to undefined if the key is not present in the object store.
     * @abstract
     * @param {string} key The primary key to look for.
     * @returns {Promise.<*>} A promise of the object stored under the given key, or undefined if not present.
     */
    async get(key) {} // eslint-disable-line no-unused-vars

    /**
     * Inserts or replaces a key-value pair.
     * @abstract
     * @param {string} key The primary key to associate the value with.
     * @param {*} value The value to write.
     * @returns {Promise} The promise resolves after writing to the current object store finished.
     */
    async put(key, value) {} // eslint-disable-line no-unused-vars

    /**
     * Removes the key-value pair of the given key from the object store.
     * @abstract
     * @param {string} key The primary key to delete along with the associated object.
     * @returns {Promise} The promise resolves after writing to the current object store finished.
     */
    async remove(key) {} // eslint-disable-line no-unused-vars

    /**
     * Returns a promise of a set of keys fulfilling the given query.
     * If the optional query is not given, it returns all keys in the object store.
     * If the query is of type KeyRange, it returns all keys of the object store being within this range.
     * If the query is of type Query, it returns all keys fulfilling the query.
     * @abstract
     * @param {Query|KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Set.<string>>} A promise of the set of keys relevant to the query.
     */
    async keys(query=null) {} // eslint-disable-line no-unused-vars

    /**
     * Returns a promise of an array of objects whose primary keys fulfill the given query.
     * If the optional query is not given, it returns all objects in the object store.
     * If the query is of type KeyRange, it returns all objects whose primary keys are within this range.
     * If the query is of type Query, it returns all objects whose primary keys fulfill the query.
     * @abstract
     * @param {Query|KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Array.<*>>} A promise of the array of objects relevant to the query.
     */
    async values(query=null) {} // eslint-disable-line no-unused-vars

    /**
     * Returns a promise of the object whose primary key is maximal for the given range.
     * If the optional query is not given, it returns the object whose key is maximal.
     * If the query is of type KeyRange, it returns the object whose primary key is maximal for the given range.
     * @abstract
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<*>} A promise of the object relevant to the query.
     */
    async maxValue(query=null) {} // eslint-disable-line no-unused-vars

    /**
     * Returns a promise of the key being maximal for the given range.
     * If the optional query is not given, it returns the maximal key.
     * If the query is of type KeyRange, it returns the key being maximal for the given range.
     * @abstract
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<string>} A promise of the key relevant to the query.
     */
    async maxKey(query=null) {} // eslint-disable-line no-unused-vars

    /**
     * Returns a promise of the key being minimal for the given range.
     * If the optional query is not given, it returns the minimal key.
     * If the query is of type KeyRange, it returns the key being minimal for the given range.
     * @abstract
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<string>} A promise of the key relevant to the query.
     */
    async minKey(query=null) {} // eslint-disable-line no-unused-vars

    /**
     * Returns a promise of the object whose primary key is minimal for the given range.
     * If the optional query is not given, it returns the object whose key is minimal.
     * If the query is of type KeyRange, it returns the object whose primary key is minimal for the given range.
     * @abstract
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<*>} A promise of the object relevant to the query.
     */
    async minValue(query=null) {} // eslint-disable-line no-unused-vars

    /**
     * Returns the count of entries in the given range.
     * If the optional query is not given, it returns the count of entries in the object store.
     * If the query is of type KeyRange, it returns the count of entries within the given range.
     * @abstract
     * @param {KeyRange} [query]
     * @returns {Promise.<number>}
     */
    async count(query=null) {} // eslint-disable-line no-unused-vars

    /**
     * Is used to commit the state of an open transaction.
     * A user only needs to call this method on Transactions without arguments.
     * The optional tx argument is only used internally, in order to commit a transaction to the underlying store.
     * If the commit was successful, the method returns true, and false otherwise.
     * @abstract
     * @param {Transaction} [tx] The transaction to be applied, only used internally.
     * @returns {Promise.<boolean>} A promise of the success outcome.
     */
    async commit(tx) {} // eslint-disable-line no-unused-vars

    /**
     * Is used to abort an open transaction.
     * A user only needs to call this method on Transactions without arguments.
     * The optional tx argument is only used internally, in order to abort a transaction on the underlying store.
     * @abstract
     * @param {Transaction} [tx] The transaction to be aborted, only used internally.
     * @returns {Promise} The promise resolves after successful abortion of the transaction.
     */
    async abort(tx) {} // eslint-disable-line no-unused-vars

    /**
     * Returns the index of the given name.
     * If the index does not exist, it returns undefined.
     * @abstract
     * @param {string} indexName The name of the requested index.
     * @returns {IIndex} The index associated with the given name.
     */
    async index(indexName) {} // eslint-disable-line no-unused-vars

    /**
     * Internally applies a transaction to the store's state.
     * This needs to be done in batch (as a db level transaction), i.e., either the full state is updated
     * or no changes are applied.
     * @abstract
     * @param {Transaction} tx The transaction to apply.
     * @returns {Promise} The promise resolves after applying the transaction.
     * @protected
     */
    async _apply(tx) {} // eslint-disable-line no-unused-vars

    /**
     * Empties the object store.
     * @abstract
     * @returns {Promise} The promise resolves after emptying the object store.
     */
    async truncate() {} // eslint-disable-line no-unused-vars

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
     * @abstract
     * @param {string} indexName The name of the index.
     * @param {string|Array.<string>} [keyPath] The path to the key within the object. May be an array for multiple levels.
     * @param {boolean} [multiEntry]
     */
    async createIndex(indexName, keyPath, multiEntry=false) {} // eslint-disable-line no-unused-vars

    /**
     * Deletes a secondary index from the object store.
     * @abstract
     * @param indexName
     * @returns {Promise} The promise resolves after deleting the index.
     */
    deleteIndex(indexName) {} // eslint-disable-line no-unused-vars

    /**
     * Closes the object store and potential connections.
     * @abstract
     * @returns {Promise} The promise resolves after closing the object store.
     */
    async close() {} // eslint-disable-line no-unused-vars

    /** @type {boolean} */
    get connected() {}  // eslint-disable-line no-unused-vars

    /**
     * Creates a new transaction, ensuring read isolation
     * on the most recently successfully committed state.
     * @abstract
     * @returns {Transaction} The transaction object.
     */
    transaction() {} // eslint-disable-line no-unused-vars
}
