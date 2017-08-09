/**
 * @implements {IObjectStore}
 */
class Transaction {
    /**
     * @param {IObjectStore} backend
     * @param {IObjectStore} [commitBackend]
     * @param {boolean} [enableWatchdog]
     */
    constructor(backend, commitBackend, enableWatchdog=true) {
        this._id = Transaction._instanceCount++;
        this._backend = backend;
        this._commitBackend = commitBackend || backend;
        this._modified = new Map();
        this._removed = new Set();
        this._originalValues = new Map();
        this._truncated = false;
        this._indices = TransactionIndex.derive(this, backend);

        this._state = Transaction.STATE.OPEN;

        this._enableWatchdog = enableWatchdog;
        if (this._enableWatchdog) {
            this._watchdog = setTimeout(() => {
                this.abort();
                throw 'Watchdog timer aborted transaction';
            }, Transaction.WATCHDOG_TIMER);
        }
    }

    /** @type {number} */
    get id() {
        return this._id;
    }

    /** @type {Map.<string,IIndex>} */
    get indices() {
        return this._indices;
    }

    get state() {
        return this._state;
    }

    /**
     * @param {Transaction} tx
     * @returns {Promise.<boolean>}
     * @protected
     */
    async _apply(tx) {
        if (!(tx instanceof Transaction)) {
            throw 'Can only apply transactions';
        }
        if (tx._truncated) {
            await this.truncate();
        }
        for (const [key, value] of tx._modified) {
            // If this transaction has key in its originalValues, we use it.
            // Otherwise, the original value has to coincide with the transaction's stored original value.
            let oldValue;
            if (this._originalValues.has(key)) {
                oldValue = this._originalValues.get(key);
            } else {
                oldValue = tx._originalValues.get(key);
                this._originalValues.set(key, oldValue);
            }

            this._put(key, value, oldValue);
        }
        for (const key of tx._removed) {
            // If this transaction has key in its originalValues, we use it.
            // Otherwise, the original value has to coincide with the transaction's stored original value.
            let oldValue;
            if (this._originalValues.has(key)) {
                oldValue = this._originalValues.get(key);
            } else {
                oldValue = tx._originalValues.get(key);
                this._originalValues.set(key, oldValue);
            }

            this._remove(key, oldValue);
        }
    }

    /**
     * @returns {Promise}
     */
    async truncate() {
        this._truncated = true;
        this._modified.clear();
        this._removed.clear();
        this._originalValues.clear();

        // Update indices.
        for (const index of this._indices.values()) {
            index.truncate();
        }
    }

    /**
     * @param {Transaction} [tx]
     * @returns {Promise.<boolean>}
     */
    async commit(tx) {
        // Transaction is given, forward to backend.
        if (tx !== undefined) {
            // Make sure transaction can be based on this state.
            if (this._state !== Transaction.STATE.COMMITTED) {
                throw 'Transaction is based on invalid state';
            }
            return this._commitBackend.commit(tx);
        }

        if (this._state !== Transaction.STATE.OPEN) {
            throw 'Transaction already closed';
        }
        if (this._enableWatchdog) {
            clearTimeout(this._watchdog);
        }
        if (await this._commitBackend.commit(this)) {
            this._state = Transaction.STATE.COMMITTED;
            return true;
        } else {
            this._state = Transaction.STATE.CONFLICTED;
            return false;
        }
    }

    /**
     * @param {Transaction} [tx]
     */
    async abort(tx) {
        // Transaction is given, forward to backend.
        if (tx !== undefined) {
            // Make sure transaction can be based on this state.
            if (this._state !== Transaction.STATE.COMMITTED) {
                throw 'Transaction is based on invalid state';
            }

            await this._commitBackend.abort(tx);
        }

        if (this._state !== Transaction.STATE.OPEN) {
            throw 'Transaction already closed';
        }
        if (this._enableWatchdog) {
            clearTimeout(this._watchdog);
        }
        await this._commitBackend.abort(this);
        this._state = Transaction.STATE.ABORTED;
        return true;
    }

    /**
     * @param {string} key
     * @returns {Promise.<*>}
     */
    async get(key) {
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
        return await this._backend.get(key);
    }

    /**
     * @param {string} key
     * @param {*} value
     */
    async put(key, value) {
        if (this._state !== Transaction.STATE.OPEN) {
            throw 'Transaction already closed';
        }

        const oldValue = await this.get(key);

        // Save for indices.
        if (!this._originalValues.has(key)) {
            this._originalValues.set(key, oldValue);
        }

        this._put(key, value, oldValue);
    }

    /**
     * @param {string} key
     * @param {*} value
     * @param {*} [oldValue]
     */
    _put(key, value, oldValue) {
        this._removed.delete(key);
        this._modified.set(key, value);

        // Update indices.
        for (const index of this._indices.values()) {
            index.put(key, value, oldValue);
        }
    }

    /**
     * @param {string} key
     */
    async remove(key) {
        if (this._state !== Transaction.STATE.OPEN) {
            throw 'Transaction already closed';
        }

        const oldValue = await this.get(key);
        // Only remove if it exists.
        if (oldValue !== undefined) {
            // Save for indices.
            if (!this._originalValues.has(key)) {
                this._originalValues.set(key, oldValue);
            }

            this._remove(key, oldValue);
        }
    }

    /**
     * @param {string} key
     * @param {*} oldValue
     */
    _remove(key, oldValue) {
        this._removed.add(key);
        this._modified.delete(key);

        // Update indices.
        for (const index of this._indices.values()) {
            index.remove(key, oldValue);
        }
    }

    /**
     * @param {Query|KeyRange} [query]
     * @returns {Promise.<Set.<string>>}
     */
    async keys(query=null) {
        if (query !== null && query instanceof Query) {
            return query.keys(this);
        }
        let keys = new Set();
        if (!this._truncated) {
            keys = await this._backend.keys(query);
        }
        keys = keys.difference(this._removed);
        for (const key of this._modified.keys()) {
            if (query === null || query.includes(key)) {
                keys.add(key);
            }
        }
        return keys;
    }

    /**
     * @param {Query|KeyRange} [query]
     * @returns {Promise.<Array.<*>>}
     */
    async values(query=null) {
        if (query !== null && query instanceof Query) {
            return query.values(this);
        }
        const keys = await this.keys(query);
        const valuePromises = [];
        for (const key of keys) {
            valuePromises.push(this.get(key));
        }
        return Promise.all(valuePromises);
    }

    /**
     * @param {KeyRange|*} [query]
     * @returns {Promise.<*>}
     */
    async maxValue(query=null) {
        const maxKey = await this.maxKey(query);
        return this.get(maxKey);
    }

    /**
     * @param {KeyRange|*} [query]
     * @returns {Promise.<string>>}
     */
    async maxKey(query=null) {
        // Take underlying maxKey.
        let maxKey = undefined;
        if (!this._truncated) {
            maxKey = await this._backend.maxKey(query);
        }

        // If this key has been removed, find next best key.
        while (maxKey !== undefined && this._removed.has(maxKey)) {
            const tmpQuery = KeyRange.upperBound(maxKey, true);
            maxKey = await this._backend.maxKey(tmpQuery);

            // If we get out of the range, stop here.
            if (query !== null && !query.includes(maxKey)) {
                maxKey = undefined;
                break;
            }
        }

        for (const key of this._modified.keys()) {
            // Find better maxKey in modified data.
            if ((query === null || query.includes(key)) && (maxKey === undefined || key > maxKey)) {
                maxKey = key;
            }
        }
        return maxKey;
    }
    /**
     * @param {KeyRange|*} [query]
     * @returns {Promise.<*>}
     */
    async minValue(query=null) {
        const minKey = await this.minKey(query);
        return this.get(minKey);
    }

    /**
     * @param {KeyRange|*} [query]
     * @returns {Promise.<string>>}
     */
    async minKey(query=null) {
        // Take underlying minKey.
        let minKey = undefined;
        if (!this._truncated) {
            minKey = await this._backend.minKey(query);
        }

        // If this key has been removed, find next best key.
        while (minKey !== undefined && this._removed.has(minKey)) {
            const tmpQuery = KeyRange.lowerBound(minKey, true);
            minKey = await this._backend.minKey(tmpQuery);

            // If we get out of the range, stop here.
            if (query !== null && !query.includes(minKey)) {
                minKey = undefined;
                break;
            }
        }

        for (const key of this._modified.keys()) {
            // Find better maxKey in modified data.
            if ((query === null || query.includes(key)) && (minKey === undefined || key < minKey)) {
                minKey = key;
            }
        }
        return minKey;
    }


    /**
     * @param {KeyRange|*} [query]
     * @returns {Promise.<number>}
     */
    async count(query=null) {
        // Unfortunately, we cannot do better than getting keys + counting.
        return (await this.keys(query)).size;
    }

    /**
     * @param {string} indexName
     * @returns {IIndex}
     */
    index(indexName) {
        return this._indices.get(indexName);
    }

    /**
     * @param {string} indexName
     * @param {string|Array.<string>} [keyPath]
     */
    async createIndex(indexName, keyPath) {
        throw 'Cannot create index in transaction';
    }

    /**
     * @returns {Promise}
     */
    close() {
        return this.abort();
    }
}
Transaction.WATCHDOG_TIMER = 10000 /*ms*/;
Transaction.STATE = {
    OPEN: 0,
    COMMITTED: 1,
    ABORTED: 2,
    CONFLICTED: 3
};
Transaction._instanceCount = 0;
Class.register(Transaction);
