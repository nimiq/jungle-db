/**
 * @interface
 */
class IIndex {
    /**
     * @abstract
     * @type {string}
     */
    get keyPath() {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @type {boolean}
     */
    get multiEntry() {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @param {KeyRange|*} [query]
     * @returns {Promise.<Set.<string>>}
     */
    async keys(query=null) {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @param {KeyRange|*} [query]
     * @returns {Promise.<Array.<*>>}
     */
    async values(query=null) {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @param {KeyRange|*} [query]
     * @returns {Promise.<Array.<*>>}
     */
    async maxValues(query=null) {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @param {KeyRange|*} [query]
     * @returns {Promise.<Set.<string>>}
     */
    async maxKeys(query=null) {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @param {KeyRange|*} [query]
     * @returns {Promise.<Array.<*>>}
     */
    async minValues(query=null) {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @param {KeyRange|*} [query]
     * @returns {Promise.<Set.<string>>}
     */
    async minKeys(query=null) {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @param {KeyRange|*} [query]
     * @returns {Promise.<number>}
     */
    async count(query=null) {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @returns {Promise}
     */
    async truncate() {} // eslint-disable-line no-unused-vars
}
