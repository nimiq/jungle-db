/**
 * Synchronous transactions avoid unnecessary async/await calls by preloading and caching
 * all necessary key-value-pairs.
 *
 * WARNING: If not all required key-value-pairs are preloaded, the results of any call on a synchronous transaction
 * might be wrong. Only use synchronous transactions, if unavoidable.
 * @implements {IObjectStore}
 * @implements {ICommittable}
 * @implements {ISynchronousObjectStore}
 * @extends {Transaction}
 */
class SynchronousTransaction extends Transaction {
    /**
     * This constructor should only be called by an ObjectStore object.
     * Our transactions have a watchdog enabled by default,
     * logging a warning after a certain time specified by WATCHDOG_TIMER.
     * This helps to detect unclosed transactions preventing to store the state in
     * the persistent backend.
     * @param {ObjectStore} objectStore The object store this transaction belongs to.
     * @param {IObjectStore} parent The backend on which the transaction is based,
     * i.e., another transaction or the real database.
     * @param {ICommittable} [managingBackend] The object store managing the transactions,
     * i.e., the ObjectStore object.
     * @param {boolean} [enableWatchdog] If this is is set to true (default),
     * a warning will be logged if left open for longer than WATCHDOG_TIMER.
     * @protected
     */
    constructor(objectStore, parent, managingBackend, enableWatchdog=true) {
        super(objectStore, parent, managingBackend, enableWatchdog);
        /** @type {Map.<string,*>} */
        this._cache = new Map();
    }

    /**
     * This method preloads a set of keys and caches them.
     * It can be called as often as needed.
     * @param {Array.<string>} keys The keys to preload.
     * @return {Promise}
     */
    preload(keys) {
        keys = keys.filter(key => !this.isCached(key));
        return Promise.all(keys.map(key => this.get(key)));
    }

    /**
     * A check whether a certain key is cached.
     * @param {string} key The key to check.
     * @return {boolean} A boolean indicating whether the key is already in the cache.
     */
    isCached(key) {
        // This also prevents double caching.
        return this._cache.has(key) || (this._parent.isSynchronous() ? this._parent.isCached(key) : false);
    }

    /**
     * @override
     */
    async get(key) {
        // Use cache or ask parent.
        let value = this.getSync(key, false);
        if (!value) {
            value = await Transaction.prototype.get.call(this, key);
            this._cache.set(key, value);
        }
        return value;
    }

    /**
     * Internal method to query cache.
     * @param {string} key
     * @param {boolean} [expectPresence]
     * @return {*} The cached value.
     * @private
     */
    _getCached(key, expectPresence=true) {
        const value = this._cache.get(key);

        // Use cache only if the parent is not synchronous.
        if (!value && this._parent.isSynchronous()) {
            return this._parent.getSync(key, expectPresence);
        }

        if (expectPresence && !value) {
            throw new Error(`Missing key in cache: ${key}`);
        }
        return value;
    }

    /**
     * Returns the object stored under the given primary key.
     * Resolves to undefined if the key is not present in the object store.
     * @param {string} key The primary key to look for.
     * @param {boolean} [expectPresence] Method throws an error if key is not present in transaction or cache.
     * @returns {*} The object stored under the given key, or undefined if not present.
     */
    getSync(key, expectPresence=true) {
        // Order is as follows:
        // 1. check if removed,
        // 2. check if modified,
        // 3. check if truncated
        // 4. request from backend
        if (this._removed.has(key)) {
            return undefined;
        }
        if (this._modified.has(key)) {
            return this._modified.get(key);
        }
        if (this._truncated) {
            return undefined;
        }
        return this._getCached(key, expectPresence);
    }

    /**
     * Inserts or replaces a key-value pair.
     * @param {string} key The primary key to associate the value with.
     * @param {*} value The value to write.
     */
    putSync(key, value) {
        if (this._state !== Transaction.STATE.OPEN) {
            throw new Error('Transaction already closed');
        }

        const oldValue = this.getSync(key, false);

        this._put(key, value, oldValue);
    }

    /**
     * Removes the key-value pair of the given key from the object store.
     * @param {string} key The primary key to delete along with the associated object.
     */
    removeSync(key) {
        if (this._state !== Transaction.STATE.OPEN) {
            throw new Error('Transaction already closed');
        }

        const oldValue = this.getSync(key, false);

        this._remove(key, oldValue);
    }

    /**
     * @override
     */
    snapshot() {
        if (!this._objectStore.isSynchronous()) throw new Error('Invalid call on SynchronousTransaction');
        return super.snapshot();
    }

    /**
     * Checks whether an object store implements the ISynchronousObjectStore interface.
     * @override
     * @returns {boolean} The transaction object.
     */
    isSynchronous() {
        return true;
    }
}
Class.register(SynchronousTransaction);
