/**
 * This interface represents an object store (roughly corresponding to a table in a relational database).
 * It stores key-value pairs where the key is generally considered to be a string and the value is any object.
 * The key is the entry's primary key. Other keys within the object may be accessed by indices as offered by the store.
 * @interface
 * @implements {IReadableObjectStore}
 */
class IObjectStore extends IReadableObjectStore {
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
     * Creates a new transaction, ensuring read isolation
     * on the most recently successfully committed state.
     * @abstract
     * @param {boolean} [enableWatchdog] Boolean allows to disable watchdog timer.
     * @returns {Transaction} The transaction object.
     */
    transaction(enableWatchdog = true) {} // eslint-disable-line no-unused-vars

    /**
     * Creates a new synchronous transaction, ensuring read isolation
     * on the most recently successfully committed state.
     * @abstract
     * @param {boolean} [enableWatchdog] Boolean allows to disable watchdog timer.
     * @returns {SynchronousTransaction} The transaction object.
     */
    synchronousTransaction(enableWatchdog = true) {} // eslint-disable-line no-unused-vars
}
