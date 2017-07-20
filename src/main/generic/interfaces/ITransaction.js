/**
 * @interface
 */
class ITransaction {
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
     * @returns {boolean}
     */
    async commit() {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @returns {boolean}
     */
    async abort() {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @param {string} index
     * @param {string} op
     * @param {*} [value]
     * @returns {IQuery}
     */
    async query(index, op, value) {} // eslint-disable-line no-unused-vars
}
