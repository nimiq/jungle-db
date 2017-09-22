/**
 * This interface represents a secondary index.
 * A secondary index is always associated with a so called key path.
 * The key path describes the path of the secondary key within the stored objects.
 * Only objects for which the key path exists are part of the secondary index.
 *
 * A key path is defined by a key within the object or alternatively a path through the object to a specific subkey.
 * For example, ['a', 'b'] could be used to use 'key' as the key in the following object:
 * { 'a': { 'b': 'key' } }
 *
 * If a secondary index is a multi entry index, and the value at the key path is iterable,
 * every item of the iterable value will be associated with the object.
 *
 * All methods with the `Keys` suffix return a set of primary keys,
 * while the given key ranges are evaluated on the secondary index and
 * thus on the value at the specified key path.
 * For simplicity, we refer to the value at the key path as the secondary key.
 * @interface
 */
class IIndex {
    /**
     * The key path associated with this index.
     * A key path is defined by a key within the object or alternatively a path through the object to a specific subkey.
     * For example, ['a', 'b'] could be used to use 'key' as the key in the following object:
     * { 'a': { 'b': 'key' } }
     * @abstract
     * @type {string|Array.<string>}
     */
    get keyPath() {} // eslint-disable-line no-unused-vars

    /**
     * This value determines whether the index supports multiple secondary keys per entry.
     * If so, the value at the key path is considered to be an iterable.
     * @abstract
     * @type {boolean}
     */
    get multiEntry() {} // eslint-disable-line no-unused-vars

    /**
     * Returns a promise of a set of primary keys, whose associated objects' secondary keys are in the given range.
     * If the optional query is not given, it returns all primary keys in the index.
     * If the query is of type KeyRange, it returns all primary keys for which the secondary key is within this range.
     * @abstract
     * @param {KeyRange} [query] Optional query to check the secondary keys against.
     * @returns {Promise.<Set.<string>>} A promise of the set of primary keys relevant to the query.
     */
    async keys(query=null) {} // eslint-disable-line no-unused-vars

    /**
     * Returns a promise of an array of objects whose secondary keys fulfill the given query.
     * If the optional query is not given, it returns all objects in the index.
     * If the query is of type KeyRange, it returns all objects whose secondary keys are within this range.
     * @abstract
     * @param {KeyRange} [query] Optional query to check secondary keys against.
     * @param {ICodec} [codec] Optional codec overriding the object store's default (null is the identity codec).
     * @returns {Promise.<Array.<*>>} A promise of the array of objects relevant to the query.
     */
    async values(query=null, decoder=undefined) {} // eslint-disable-line no-unused-vars

    /**
     * Returns a promise of an array of objects whose secondary key is maximal for the given range.
     * If the optional query is not given, it returns the objects whose secondary key is maximal within the index.
     * If the query is of type KeyRange, it returns the objects whose secondary key is maximal for the given range.
     * @abstract
     * @param {KeyRange} [query] Optional query to check keys against.
     * @param {ICodec} [codec] Optional codec overriding the object store's default (null is the identity codec).
     * @returns {Promise.<Array.<*>>} A promise of array of objects relevant to the query.
     */
    async maxValues(query=null, decoder=undefined) {} // eslint-disable-line no-unused-vars

    /**
     * Returns a promise of a set of primary keys, whose associated secondary keys are maximal for the given range.
     * If the optional query is not given, it returns the set of primary keys, whose associated secondary key is maximal within the index.
     * If the query is of type KeyRange, it returns the set of primary keys, whose associated secondary key is maximal for the given range.
     * @abstract
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Set.<*>>} A promise of the key relevant to the query.
     */
    async maxKeys(query=null) {} // eslint-disable-line no-unused-vars

    /**
     * Returns a promise of an array of objects whose secondary key is minimal for the given range.
     * If the optional query is not given, it returns the objects whose secondary key is minimal within the index.
     * If the query is of type KeyRange, it returns the objects whose secondary key is minimal for the given range.
     * @abstract
     * @param {KeyRange} [query] Optional query to check keys against.
     * @param {ICodec} [codec] Optional codec overriding the object store's default (null is the identity codec).
     * @returns {Promise.<Array.<*>>} A promise of array of objects relevant to the query.
     */
    async minValues(query=null, decoder=undefined) {} // eslint-disable-line no-unused-vars

    /**
     * Returns a promise of a set of primary keys, whose associated secondary keys are minimal for the given range.
     * If the optional query is not given, it returns the set of primary keys, whose associated secondary key is minimal within the index.
     * If the query is of type KeyRange, it returns the set of primary keys, whose associated secondary key is minimal for the given range.
     * @abstract
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Set.<*>>} A promise of the key relevant to the query.
     */
    async minKeys(query=null) {} // eslint-disable-line no-unused-vars

    /**
     * Returns the count of entries, whose secondary key is in the given range.
     * If the optional query is not given, it returns the count of entries in the index.
     * If the query is of type KeyRange, it returns the count of entries, whose secondary key is within the given range.
     * @abstract
     * @param {KeyRange} [query]
     * @returns {Promise.<number>}
     */
    async count(query=null) {} // eslint-disable-line no-unused-vars

    /**
     * Reinitialises the index.
     * @abstract
     * @returns {Promise} The promise resolves after emptying the index.
     */
    async truncate() {} // eslint-disable-line no-unused-vars
}
