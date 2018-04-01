/**
 * This is the main interface of the JungleDB.
 * @interface
 */
class IJungleDB {
    /**
     * Connects to the indexedDB.
     * @abstract
     * @returns {Promise} A promise resolving on successful connection.
     */
    connect() {} // eslint-disable-line no-unused-vars

    /**
     * Closes the database connection.
     * @abstract
     * @returns {Promise} The promise resolves after closing the database.
     */
    close() {} // eslint-disable-line no-unused-vars

    /**
     * Fully deletes the database.
     * @abstract
     * @returns {Promise} The promise resolves after deleting the database.
     */
    async destroy() {} // eslint-disable-line no-unused-vars

    /** @type {boolean} Whether a connection is established. */
    get connected() {} // eslint-disable-line no-unused-vars

    /**
     * Returns the ObjectStore object for a given table name.
     * @abstract
     * @param {string} tableName The table name to access.
     * @returns {ObjectStore} The ObjectStore object.
     */
    getObjectStore(tableName) {} // eslint-disable-line no-unused-vars

    /**
     * Creates a new object store (and allows to access it).
     * This method always has to be called before connecting to the database.
     * If it is not called, the object store will not be accessible afterwards.
     * If a call is newly introduced, but the database version did not change,
     * the table does not exist yet.
     * @abstract
     * @param {string} tableName The name of the object store.
     * @param {ObjectStoreConfig} [options] An options object.
     * @returns {IObjectStore}
     */
    createObjectStore(tableName, options = {}) {} // eslint-disable-line no-unused-vars

    /**
     * Deletes an object store.
     * This method has to be called before connecting to the database.
     * @abstract
     * @param {string} tableName
     * @param {{upgradeCondition:?boolean|?function(oldVersion:number, newVersion:number):boolean}} [options]
     */
    deleteObjectStore(tableName, options = {}) {} // eslint-disable-line no-unused-vars

    /**
     * Creates a volatile object store (non-persistent).
     * @abstract
     * @param {{codec:?ICodec}} [options] An options object.
     * @returns {ObjectStore}
     */
    static createVolatileObjectStore(options = {}) {} // eslint-disable-line no-unused-vars

    /**
     * Is used to commit multiple transactions atomically.
     * This guarantees that either all transactions are written or none.
     * The method takes a list of transactions (at least two transactions).
     * If the commit was successful, the method returns true, and false otherwise.
     * @abstract
     * @param {Transaction|CombinedTransaction} tx1 The first transaction
     * (a CombinedTransaction object is only used internally).
     * @param {Transaction} tx2 The second transaction.
     * @param {...Transaction} txs A list of further transactions to commit together.
     * @returns {Promise.<boolean>} A promise of the success outcome.
     */
    static commitCombined(tx1, tx2, ...txs) {} // eslint-disable-line no-unused-vars
}
