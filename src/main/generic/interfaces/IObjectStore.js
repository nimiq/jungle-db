/**
 * @interface
 */
class IObjectStore {
    /**
     * @abstract
     * @type {Map.<string,IIndex>}
     */
    get indices() {} // eslint-disable-line no-unused-vars

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
     * @param {Query|KeyRange} [query]
     * @returns {Promise.<Set.<string>>}
     */
    async keys(query=null) {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @param {Query|KeyRange} [query]
     * @returns {Promise.<Array.<*>>}
     */
    async values(query=null) {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @param {KeyRange} [query]
     * @returns {Promise.<*>}
     */
    async maxValue(query=null) {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @param {KeyRange} [query]
     * @returns {Promise.<string>}
     */
    async maxKey(query=null) {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @param {KeyRange} [query]
     * @returns {Promise.<string>}
     */
    async minKey(query=null) {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @param {KeyRange} [query]
     * @returns {Promise.<*>}
     */
    async minValue(query=null) {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @param {KeyRange} [query]
     * @returns {Promise.<number>}
     */
    async count(query=null) {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @param {Transaction} [tx]
     * @returns {Promise.<boolean>}
     */
    async commit(tx) {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @param {Transaction} [tx]
     */
    async abort(tx) {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @param {string} indexName
     * @returns {IIndex}
     */
    async index(indexName) {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @param {Transaction} tx
     * @returns {Promise.<boolean>}
     * @protected
     */
    async _apply(tx) {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @param {string} indexName
     * @param {string|Array.<string>} [keyPath]
     * @param {boolean} [multiEntry]
     */
    async createIndex(indexName, keyPath, multiEntry=false) {} // eslint-disable-line no-unused-vars
}
