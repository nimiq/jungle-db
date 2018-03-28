/**
 * A simple object implementing parts of the Transaction's class.
 * It is used to keep track of modifications on a persistent index
 * and to apply them all at once.
 * This class is to be used only internally.
 */
class EncodedLMDBTransaction {
    /**
     * Create a new IndexTransaction.
     * @param {LMDBBaseBackend} backend
     */
    constructor(backend) {
        this._modified = [];
        this._removed = new Set();
        this._truncated = false;

        /** @type {Map.<string,EncodedLMDBTransaction>} */
        this._indices = new Map();
        /** @type {Map.<string,*>} */
        this._removedValues = new Map();
        this._byteSize = 0;
        this._backend = backend;
    }

    /** @type {Array} */
    get modified() {
        return this._modified;
    }

    /** @type {Set.<*>} */
    get removed() {
        return this._removed;
    }

    /** @type {boolean} */
    get truncated() {
        return this._truncated;
    }

    /**
     * @type {number}
     */
    get byteSize() {
        return this._byteSize;
    }

    /**
     * @type {LMDBBaseBackend}
     */
    get backend() {
        return this._backend;
    }

    /**
     * @param {string} indexName
     * @param {EncodedLMDBTransaction} tx
     */
    setIndex(indexName, tx) {
        this._indices.set(indexName, tx);
        this._byteSize += tx.byteSize;
    }

    /**
     * @param {string} indexName
     * @returns {EncodedLMDBTransaction}
     */
    getIndex(indexName) {
        return this._indices.get(indexName);
    }

    /**
     * Empty the index transaction.
     */
    truncate() {
        this._truncated = true;
    }

    /**
     * Put a key-value pair into the transaction.
     * @param {*} key The key.
     * @param {*} value The value.
     */
    put(key, value) {
        this._modified.push([key, value]);
        this._byteSize += EncodedLMDBTransaction._getByteSize(key) + EncodedLMDBTransaction._getByteSize(value);
    }

    /**
     * Remove a key-value pair from the transaction.
     * @param {*} key The key to remove.
     * @param {*} [value]
     */
    remove(key, value) {
        this._removed.add(key);
        if (value) {
            this._removedValues.set(key, value);
        }
    }

    /**
     * @param {string} key The key to remove.
     * @returns {*}
     */
    removedValue(key) {
        return this._removedValues.get(key);
    }

    /**
     * @param data
     * @returns {number}
     * @protected
     */
    static _getByteSize(data) {
        // We support different types of values:
        // integers, strings, Uint8Arrays, booleans (as these are the values that can be stored by LMDB)
        if (Number.isInteger(data)) {
            return 8;
        }
        if (typeof data === 'string') {
            return data.length * 2; // JavaScript uses UTF16 encoding
        }
        if (data instanceof Uint8Array) {
            return data.byteLength;
        }
        if (typeof Buffer !== 'undefined' && typeof window === 'undefined' && data instanceof Buffer) {
            return data.length;
        }
        Log.e(`Invalid datatype given for LMDBBackend: ${data}`);
        throw new Error('Invalid datatype given for LMDBBackend');
    }

}
Class.register(EncodedLMDBTransaction);
