/**
 * This interface represents an object store (roughly corresponding to a table in a relational database).
 * It stores key-value pairs where the key is generally considered to be a string and the value is any object.
 * The key is the entry's primary key. Other keys within the object may be accessed by indices as offered by the store.
 * @interface
 */
class IReadableObjectStore {
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
     * @param {RetrievalConfig} [options] Advanced retrieval options.
     * @returns {Promise.<*>} A promise of the object stored under the given key, or undefined if not present.
     */
    async get(key, options) {} // eslint-disable-line no-unused-vars

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
     * Iterates over the keys in a given range and direction.
     * The callback is called for each primary key fulfilling the query
     * until it returns false and stops the iteration.
     * @abstract
     * @param {function(key:string):boolean} callback A predicate called for each key until returning false.
     * @param {boolean} ascending Determines the direction of traversal.
     * @param {KeyRange} query An optional KeyRange to narrow down the iteration space.
     * @returns {Promise} The promise resolves after all elements have been streamed.
     */
    keyStream(callback, ascending=true, query=null) {} // eslint-disable-line no-unused-vars

    /**
     * Iterates over the keys and values in a given range and direction.
     * The callback is called for each value and primary key fulfilling the query
     * until it returns false and stops the iteration.
     * @abstract
     * @param {function(value:*, key:string):boolean} callback A predicate called for each value and key until returning false.
     * @param {boolean} ascending Determines the direction of traversal.
     * @param {KeyRange} query An optional KeyRange to narrow down the iteration space.
     * @returns {Promise} The promise resolved after all elements have been streamed.
     */
    valueStream(callback, ascending=true, query=null) {} // eslint-disable-line no-unused-vars

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
     * Returns the index of the given name.
     * If the index does not exist, it returns undefined.
     * @abstract
     * @param {string} indexName The name of the requested index.
     * @returns {IIndex} The index associated with the given name.
     */
    index(indexName) {} // eslint-disable-line no-unused-vars

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
     * Closes the object store and potential connections.
     * @abstract
     * @returns {Promise} The promise resolves after closing the object store.
     */
    async close() {} // eslint-disable-line no-unused-vars

    /** @type {boolean} */
    get connected() {}  // eslint-disable-line no-unused-vars

    /**
     * Checks whether an object store implements the ISynchronousObjectStore interface.
     * @abstract
     * @returns {boolean} The transaction object.
     */
    isSynchronous() {} // eslint-disable-line no-unused-vars
}
