/**
 * This class represents a default wrapper for object stores.
 * It wraps all functionality of an object store and also wraps newly created transactions.
 * Extend this class with your own functionality to enhance your application with more functionality
 * on the object store.
 */
class DefaultWrapper {
    /**
     * @param {IObjectStore} store
     */
    constructor(store) {
        this._store = store;
    }

    /** @type {boolean} */
    get connected() {
        return this._store.connected;
    }

    /**
     * A map of index names to indices.
     * The index names can be used to access an index.
     * @type {Map.<string,IIndex>}
     */
    get indices() {
        return this._store.indices;
    }

    /**
     * Returns a promise of the object stored under the given primary key.
     * Resolves to undefined if the key is not present in the object store.
     * @param {string} key The primary key to look for.
     * @param {ICodec} [codec] Optional codec overriding the object store's default (null is the identity codec).
     * @returns {Promise.<*>} A promise of the object stored under the given key, or undefined if not present.
     */
    async get(key, codec=undefined) {
        return this._store.get(key, codec);
    }

    /**
     * Inserts or replaces a key-value pair.
     * @param {string} key The primary key to associate the value with.
     * @param {*} value The value to write.
     * @param {ICodec} [codec] Optional codec overriding the object store's default (null is the identity codec).
     * @returns {Promise} The promise resolves after writing to the current object store finished.
     */
    async put(key, value, codec=undefined) {
        return this._store.put(key, value, codec);
    }

    /**
     * Removes the key-value pair of the given key from the object store.
     * @param {string} key The primary key to delete along with the associated object.
     * @param {ICodec} [codec] Optional codec overriding the object store's default (null is the identity codec).
     * @returns {Promise} The promise resolves after writing to the current object store finished.
     */
    async remove(key, codec=undefined) {
        return this._store.remove(key, codec);
    }

    /**
     * Returns a promise of a set of keys fulfilling the given query.
     * If the optional query is not given, it returns all keys in the object store.
     * If the query is of type KeyRange, it returns all keys of the object store being within this range.
     * If the query is of type Query, it returns all keys fulfilling the query.
     * @param {Query|KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Set.<string>>} A promise of the set of keys relevant to the query.
     */
    async keys(query=null) {
        return this._store.keys(query);
    }

    /**
     * Returns a promise of an array of objects whose primary keys fulfill the given query.
     * If the optional query is not given, it returns all objects in the object store.
     * If the query is of type KeyRange, it returns all objects whose primary keys are within this range.
     * If the query is of type Query, it returns all objects whose primary keys fulfill the query.
     * @param {Query|KeyRange} [query] Optional query to check keys against.
     * @param {ICodec} [codec] Optional codec overriding the object store's default (null is the identity codec).
     * @returns {Promise.<Array.<*>>} A promise of the array of objects relevant to the query.
     */
    async values(query=null, codec=undefined) {
        return this._store.values(query, codec);
    }

    /**
     * Returns a promise of the object whose primary key is maximal for the given range.
     * If the optional query is not given, it returns the object whose key is maximal.
     * If the query is of type KeyRange, it returns the object whose primary key is maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @param {ICodec} [codec] Optional codec overriding the object store's default (null is the identity codec).
     * @returns {Promise.<*>} A promise of the object relevant to the query.
     */
    async maxValue(query=null, codec=undefined) {
        return this._store.maxValue(query, codec);
    }

    /**
     * Returns a promise of the key being maximal for the given range.
     * If the optional query is not given, it returns the maximal key.
     * If the query is of type KeyRange, it returns the key being maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<string>} A promise of the key relevant to the query.
     */
    async maxKey(query=null) {
        return this._store.maxKey(query);
    }

    /**
     * Returns a promise of the key being minimal for the given range.
     * If the optional query is not given, it returns the minimal key.
     * If the query is of type KeyRange, it returns the key being minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<string>} A promise of the key relevant to the query.
     */
    async minKey(query=null) {
        return this._store.minKey(query);
    }

    /**
     * Returns a promise of the object whose primary key is minimal for the given range.
     * If the optional query is not given, it returns the object whose key is minimal.
     * If the query is of type KeyRange, it returns the object whose primary key is minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @param {ICodec} [codec] Optional codec overriding the object store's default (null is the identity codec).
     * @returns {Promise.<*>} A promise of the object relevant to the query.
     */
    async minValue(query=null, codec=undefined) {
        return this._store.minValue(query, codec);
    }

    /**
     * Returns the count of entries in the given range.
     * If the optional query is not given, it returns the count of entries in the object store.
     * If the query is of type KeyRange, it returns the count of entries within the given range.
     * @param {KeyRange} [query]
     * @returns {Promise.<number>}
     */
    async count(query=null) {
        return this._store.count(query);
    }

    /**
     * Is used to commit the state of an open transaction.
     * A user only needs to call this method on Transactions without arguments.
     * The optional tx argument is only used internally, in order to commit a transaction to the underlying store.
     * If the commit was successful, the method returns true, and false otherwise.
     * @param {Transaction} [tx] The transaction to be applied, only used internally.
     * @returns {Promise.<boolean>} A promise of the success outcome.
     */
    async commit(tx) {
        return this._store.commit(tx);
    }

    /**
     * Is used to abort an open transaction.
     * A user only needs to call this method on Transactions without arguments.
     * The optional tx argument is only used internally, in order to abort a transaction on the underlying store.
     * @param {Transaction} [tx] The transaction to be aborted, only used internally.
     * @returns {Promise} The promise resolves after successful abortion of the transaction.
     */
    async abort(tx) {
        return this._store.abort(tx);
    }

    /**
     * Returns the index of the given name.
     * If the index does not exist, it returns undefined.
     * @param {string} indexName The name of the requested index.
     * @returns {IIndex} The index associated with the given name.
     */
    async index(indexName) {
        return this._store.index(indexName);
    }

    /**
     * Internally applies a transaction to the store's state.
     * This needs to be done in batch (as a db level transaction), i.e., either the full state is updated
     * or no changes are applied.
     * @param {Transaction} tx The transaction to apply.
     * @returns {Promise} The promise resolves after applying the transaction.
     * @protected
     */
    async _apply(tx) {
        return this._store._apply(tx);
    }

    /**
     * Empties the object store.
     * @returns {Promise} The promise resolves after emptying the object store.
     */
    async truncate() {
        return this._store.truncate();
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
     * @param {boolean} [multiEntry]
     */
    async createIndex(indexName, keyPath, multiEntry=false) {
        return this._store.createIndex(indexName, keyPath, multiEntry);
    }

    /**
     * Deletes a secondary index from the object store.
     * @param indexName
     * @returns {Promise} The promise resolves after deleting the index.
     */
    deleteIndex(indexName) {
        return this._store.deleteIndex(indexName);
    }

    /**
     * Closes the object store and potential connections.
     * @returns {Promise} The promise resolves after closing the object store.
     */
    async close() {
        return this._store.close();
    }

    /**
     * Internal method called to decode a single value.
     * @param {*} value Value to be decoded.
     * @param {ICodec} [codec] Optional codec overriding the object store's default (null is the identity codec).
     * @returns {*} The decoded value, either by the object store's default or the overriding decoder if given.
     */
    decode(value, codec=undefined) {
        return this._store.decode(value, codec);
    }

    /**
     * Internal method called to encode a single value.
     * @param {*} value Value to be encoded.
     * @param {ICodec} [codec] Optional codec overriding the object store's default (null is the identity codec).
     * @returns {*} The encoded value, either by the object store's default or the overriding decoder if given.
     */
    encode(value, codec=undefined) {
        return this._store.encode(value, codec);
    }

    /**
     * @returns {Transaction}
     */
    transaction() {
        if (!this._store.transaction) {
            return undefined;
        }
        const tx = this._store.transaction();
        return new this.constructor(tx);
    }
}
Class.register(DefaultWrapper);
