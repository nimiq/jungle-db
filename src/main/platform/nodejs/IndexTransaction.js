/**
 * A simple object implementing parts of the Transaction's class.
 * It is used to keep track of modifications on a persistent index
 * and to apply them all at once.
 * This class is to be used only internally.
 */
class IndexTransaction {
    /**
     * Create a new IndexTransaction.
     */
    constructor() {
        this._modified = new Map();
        this._removed = new Set();
        this._truncated = false;
    }

    /**
     * Empty the index transaction.
     * @returns {Promise.<void>} Promise resolves upon completion.
     */
    async truncate() {
        this._truncated = true;
        this._modified.clear();
        this._removed.clear();
    }

    /**
     * Put a key-value pair into the transaction.
     * @param {string} key The key.
     * @param {*} value The value.
     */
    put(key, value) {
        this._removed.delete(key);
        this._modified.set(key, value);

    }

    /**
     * Remove a key-value pair from the transaction.
     * @param {string} key The key to remove.
     */
    remove(key) {
        this._removed.add(key);
        this._modified.delete(key);
    }

}
Class.register(IndexTransaction);
