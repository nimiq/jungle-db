/**
 * This interface provides the methods specific to backends.
 * @interface
 * @extends {IObjectStore}
 */
class IBackend extends IObjectStore{
    /**
     * Returns the necessary information in order to flush a combined transaction.
     * @abstract
     * @param {Transaction} tx The transaction that should be applied to this backend.
     * @returns {Promise.<*|function()>} For non-persistent backends: a function that effectively applies the transaction.
     * Native backends otherwise specify their own information as needed by their JungleDB instance.
     */
    async applyCombined(tx) {}// eslint-disable-line no-unused-vars
}
