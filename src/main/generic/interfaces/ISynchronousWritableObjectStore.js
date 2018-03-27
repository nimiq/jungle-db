/**
 * This interface represents a synchronous object store.
 * It allows to preload key-value-pairs and store them in a cache.
 *
 * WARNING: If not all required key-value-pairs are preloaded, the results of any call on a synchronous transaction
 * might be wrong. Only use synchronous variants, if unavoidable.
 * @interface
 * @implements {IObjectStore}
 */
class ISynchronousWritableObjectStore extends IObjectStore {
    /**
     * Inserts or replaces a key-value pair.
     * @abstract
     * @param {string} key The primary key to associate the value with.
     * @param {*} value The value to write.
     */
    putSync(key, value) {} // eslint-disable-line no-unused-vars

    /**
     * Removes the key-value pair of the given key from the object store.
     * @abstract
     * @param {string} key The primary key to delete along with the associated object.
     */
    removeSync(key) {} // eslint-disable-line no-unused-vars

    /**
     * Empties the object store.
     * @abstract
     */
    truncateSync() {} // eslint-disable-line no-unused-vars
}
