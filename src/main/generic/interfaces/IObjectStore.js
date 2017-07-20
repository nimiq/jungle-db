/**
 * @interface
 */
class IObjectStore {
    /**
     * @abstract
     * @param {string} key
     * @returns {Promise.<*>}
     */
    async get(key) {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @param {string} key
     * @param {*} value
     * @returns {Promise}
     */
    async put(key, value) {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @param {string} key
     * @returns {Promise}
     */
    async remove(key) {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @returns {ITransaction}
     */
    async transaction() {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @param {string} index
     * @param {string} op
     * @param {*} [value]
     * @returns {IQuery}
     */
    async query(index, op, value) {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @param {string} indexName
     * @returns {IIndex}
     */
    async index(indexName) {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @param {string} indexName
     * @param {string|Array.<string>} [keyPath]
     */
    async ensureIndex(indexName, keyPath) {} // eslint-disable-line no-unused-vars
}
