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
    connect() {}  // eslint-disable-line no-unused-vars

    /**
     * Closes the database connection.
     * @abstract
     * @returns {Promise} The promise resolves after closing the database.
     */
    close() {}  // eslint-disable-line no-unused-vars

    /**
     * Fully deletes the database.
     * @abstract
     * @returns {Promise} The promise resolves after deleting the database.
     */
    async destroy() {}  // eslint-disable-line no-unused-vars

    /** @type {boolean} Whether a connection is established. */
    get connected() {}  // eslint-disable-line no-unused-vars

    /**
     * Returns the ObjectStore object for a given table name.
     * @abstract
     * @param {string} tableName The table name to access.
     * @returns {ObjectStore} The ObjectStore object.
     */
    getObjectStore(tableName) {}  // eslint-disable-line no-unused-vars

    /**
     * Creates a new object store (and allows to access it).
     * This method always has to be called before connecting to the database.
     * If it is not called, the object store will not be accessible afterwards.
     * If a call is newly introduced, but the database version did not change,
     * the table does not exist yet.
     * @abstract
     * @param {string} tableName The name of the object store.
     * @param {ICodec} [codec] A default codec for the object store.
     * @param {boolean} [persistent] If set to false, this object store is not persistent.
     * @returns {IObjectStore}
     */
    createObjectStore(tableName, codec=null, persistent=true) {}  // eslint-disable-line no-unused-vars

    /**
     * Deletes an object store.
     * This method has to be called before connecting to the database.
     * @abstract
     * @param {string} tableName
     */
    async deleteObjectStore(tableName) {}  // eslint-disable-line no-unused-vars

    /**
     * Creates a volatile object store (non-persistent).
     * @abstract
     * @param {function(obj:*):*} [decoder] A default decoder function for the object store.
     * @returns {IObjectStore}
     */
    static createVolatileObjectStore(decoder=null) {}  // eslint-disable-line no-unused-vars
}
