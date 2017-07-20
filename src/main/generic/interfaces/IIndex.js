/**
 * @interface
 */
class IIndex {
    /**
     * @abstract
     * @param {IKeyRange|*} [query]
     * @returns {Promise.<*>}
     */
    async get(query) {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @param {IKeyRange|*} [query]
     * @returns {Promise.<Array.<*>>}
     */
    async getAll(query) {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @param {IKeyRange|*} [query]
     * @returns {Promise.<string>}
     */
    async getKey(query) {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @param {IKeyRange|*} [query]
     * @returns {Promise.<Array.<string>>}
     */
    async getAllKeys(query) {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @param {IKeyRange|*} [query]
     * @returns {Promise.<*>}
     */
    async getMax(query) {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @param {IKeyRange|*} [query]
     * @returns {Promise.<string>>}
     */
    async getMaxKey(query) {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @param {IKeyRange|*} [query]
     * @returns {Promise.<*>}
     */
    async getMin(query) {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @param {IKeyRange|*} [query]
     * @returns {Promise.<string>>}
     */
    async getMinKey(query) {} // eslint-disable-line no-unused-vars

    /**
     * @abstract
     * @param {IKeyRange|*} [query]
     * @returns {Promise.<Array.<string>>}
     */
    async count(query) {} // eslint-disable-line no-unused-vars
}
