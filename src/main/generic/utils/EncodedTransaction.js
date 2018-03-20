/**
 * A simple object implementing parts of the Transaction's class.
 * It is used to keep track of modifications on a persistent index
 * and to apply them all at once.
 * This class is to be used only internally.
 */
class EncodedTransaction {
    /**
     * Create a new IndexTransaction.
     */
    constructor(tableName) {
        this._tableName = tableName;
        this._modified = new Map();
        this._removed = new Set();
        this._truncated = false;
    }

    /** @type {string} */
    get tableName() {
        return this._tableName;
    }

    /** @type {Map.<string,*>} */
    get modified() {
        return this._modified;
    }

    /** @type {Set.<string>} */
    get removed() {
        return this._removed;
    }

    /** @type {boolean} */
    get truncated() {
        return this._truncated;
    }

    /**
     * Empty the index transaction.
     */
    truncate() {
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
     * Get a value from the encoded transaction.
     * @param {string} key The key.
     * @return {*} value The value.
     */
    get(key) {
        return this._modified.get(key);
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
Class.register(EncodedTransaction);
