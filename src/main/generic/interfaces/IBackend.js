/**
 * This interface provides the methods specific to backends.
 * @interface
 * @implements {IReadableObjectStore}
 */
class IBackend extends IReadableObjectStore {
    /**
     * Returns the necessary information in order to flush a combined transaction.
     * @abstract
     * @param {Transaction} tx The transaction that should be applied to this backend.
     * @returns {Promise.<*|function():Promise>} For non-persistent backends: a function that effectively applies the transaction.
     * Native backends otherwise specify their own information as needed by their JungleDB instance.
     */
    async applyCombined(tx) {} // eslint-disable-line no-unused-vars

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
     * @param {{multiEntry:?boolean, unique:?boolean, upgradeCondition:?boolean|?function(oldVersion:number, newVersion:number):boolean, keyEncoding:?ILMDBEncoding|?ILevelDBEncoding, lmdbKeyEncoding:?ILMDBEncoding, leveldbKeyEncoding:?ILevelDBEncoding}} [options] An options object.
     */
    createIndex(indexName, keyPath, options = {}) {} // eslint-disable-line no-unused-vars

    /**
     * Deletes a secondary index from the object store.
     * @abstract
     * @param indexName
     * @param {{upgradeCondition:?boolean|?function(oldVersion:number, newVersion:number):boolean}} [options]
     */
    deleteIndex(indexName, options = {}) {} // eslint-disable-line no-unused-vars
}
