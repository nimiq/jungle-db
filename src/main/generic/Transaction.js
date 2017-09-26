/**
 * Transactions are created by calling the transaction method on an ObjectStore object.
 * Transactions ensure read-isolation.
 * On a given state, only *one* transaction can be committed successfully.
 * Other transactions based on the same state will end up in a conflicted state if committed.
 * Transactions opened after the successful commit of another transaction will be based on the
 * new state and hence can be committed again.
 * @implements {IObjectStore}
 */
class Transaction {
    /**
     * This constructor should only be called by an ObjectStore object.
     * Our transactions have a watchdog enabled by default,
     * aborting them after a certain time specified by WATCHDOG_TIMER.
     * This helps to detect unclosed transactions preventing to store the state in
     * the persistent backend.
     * @param {IObjectStore} backend The backend on which the transaction is based,
     * i.e., another transaction or the real database.
     * @param {IObjectStore} [commitBackend] The object store managing the transactions,
     * i.e., the ObjectStore object.
     * @param {boolean} [enableWatchdog] If this is is set to true (default),
     * transactions will be automatically aborted if left open for longer than WATCHDOG_TIMER.
     * @protected
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

        // Keep track of nested transactions.
        /** @type {Set.<Transaction>} */
        this._nested = new Set();
        this._nestedCommitted = false;

        this._enableWatchdog = enableWatchdog;
        if (this._enableWatchdog) {
            this._watchdog = setTimeout(() => {
                this.abort();
                throw 'Watchdog timer aborted transaction';
            }, Transaction.WATCHDOG_TIMER);
        }
    }

    /** @type {boolean} */
    get connected() {
        return this._commitBackend.connected;
    }

    /** @type {number} A unique transaction id. */
    get id() {
        return this._id;
    }

    /**
     * A map of index names to indices.
     * The index names can be used to access an index.
     * @type {Map.<string,IIndex>}
     */
    get indices() {
        return this._indices;
    }

    /**
     * The transaction's current state.
     * @returns {Transaction.STATE}
     */
    get state() {
        return this._state;
    }

    /**
     * Internally applies a transaction to the transaction's state.
     * This needs to be done in batch (as a db level transaction), i.e., either the full state is updated
     * or no changes are applied.
     * @param {Transaction} tx The transaction to apply.
     * @returns {Promise} The promise resolves after applying the transaction.
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
     * Empties the object store.
     * @returns {Promise} The promise resolves after emptying the object store.
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
     * Commits a transaction to the underlying backend.
     * The state is only written to the persistent backend if no other transaction is open.
     * If the commit was successful, new transactions will always be based on the new state.
     * There are two outcomes for a commit:
     * If there was no other transaction committed that was based on the same state,
     * it will be successful and change the transaction's state to COMMITTED (returning true).
     * Otherwise, the state will be CONFLICTED and the method will return false.
     * @param {Transaction} [tx] The transaction to be applied, only used internally.
     * @returns {Promise.<boolean>} A promise of the success outcome.
     */
    async commit(tx) {
        // Transaction is given, so check whether this is a nested one.
        if (tx !== undefined) {
            // Make sure transaction is based on this transaction.
            if (!this._nested.has(tx) || tx.state !== Transaction.STATE.OPEN) {
                throw 'Can only commit open, nested transactions';
            }
            this._nested.delete(tx);
            let result = false;
            // Only first one of concurrent transactions can be committed.
            if (!this._nestedCommitted) {
                // Apply nested transaction.
                this._nestedCommitted = true;
                await this._apply(tx);
                result = true;
            }
            // If there are no more nested transactions, change back to OPEN state.
            if (this._nested.size === 0) {
                this._state = Transaction.STATE.OPEN;
                this._nestedCommitted = false;
            }
            return result;
        }

        if (this._state !== Transaction.STATE.OPEN) {
            throw 'Transaction already closed or in nested state';
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
     * Aborts a transaction and (if this was the last open transaction) potentially
     * persists the most recent, committed state.
     * @param {Transaction} [tx] The transaction to be applied, only used internally.
     * @returns {Promise.<boolean>} A promise of the success outcome.
     */
    async abort(tx) {
        // Transaction is given, so check whether this is a nested one.
        if (tx !== undefined) {
            // Make sure transaction is based on this transaction.
            if (!this._nested.has(tx) || tx.state !== Transaction.STATE.OPEN) {
                throw 'Can only commit open, nested transactions';
            }
            this._nested.delete(tx);
            // If there are no more nested transactions, change back to OPEN state.
            if (this._nested.size === 0) {
                this._state = Transaction.STATE.OPEN;
                this._nestedCommitted = false;
            }
            return true;
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
     * Returns a promise of the object stored under the given primary key.
     * Resolves to undefined if the key is not present in the object store.
     * @param {string} key The primary key to look for.
     * @returns {Promise.<*>} A promise of the object stored under the given key, or undefined if not present.
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
     * Inserts or replaces a key-value pair.
     * @param {string} key The primary key to associate the value with.
     * @param {*} value The value to write.
     * @returns {Promise} The promise resolves after writing to the current object store finished.
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
     * Internal method for inserting/replacing a key-value pair.
     * @param {string} key The primary key to associate the value with.
     * @param {*} value The value to write.
     * @param {*} [oldValue] The old value associated with the key to update the indices (if applicable).
     * @private
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
     * Removes the key-value pair of the given key from the object store.
     * @param {string} key The primary key to delete along with the associated object.
     * @returns {Promise} The promise resolves after writing to the current object store finished.
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
     * Internal method for removing a key-value pair.
     * @param {string} key The primary key to delete along with the associated object.
     * @param {*} oldValue The old value associated with the key to update the indices.
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
     * Returns a promise of a set of keys fulfilling the given query.
     * If the optional query is not given, it returns all keys in the object store.
     * If the query is of type KeyRange, it returns all keys of the object store being within this range.
     * If the query is of type Query, it returns all keys fulfilling the query.
     * @param {Query|KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Set.<string>>} A promise of the set of keys relevant to the query.
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
     * Returns a promise of an array of objects whose primary keys fulfill the given query.
     * If the optional query is not given, it returns all objects in the object store.
     * If the query is of type KeyRange, it returns all objects whose primary keys are within this range.
     * If the query is of type Query, it returns all objects whose primary keys fulfill the query.
     * @param {Query|KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Array.<*>>} A promise of the array of objects relevant to the query.
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
     * Returns a promise of the object whose primary key is maximal for the given range.
     * If the optional query is not given, it returns the object whose key is maximal.
     * If the query is of type KeyRange, it returns the object whose primary key is maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<*>} A promise of the object relevant to the query.
     */
    async maxValue(query=null) {
        const maxKey = await this.maxKey(query);
        return this.get(maxKey);
    }

    /**
     * Returns a promise of the key being maximal for the given range.
     * If the optional query is not given, it returns the maximal key.
     * If the query is of type KeyRange, it returns the key being maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<string>} A promise of the key relevant to the query.
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
     * Returns a promise of the object whose primary key is minimal for the given range.
     * If the optional query is not given, it returns the object whose key is minimal.
     * If the query is of type KeyRange, it returns the object whose primary key is minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<*>} A promise of the object relevant to the query.
     */
    async minValue(query=null) {
        const minKey = await this.minKey(query);
        return this.get(minKey);
    }

    /**
     * Returns a promise of the key being minimal for the given range.
     * If the optional query is not given, it returns the minimal key.
     * If the query is of type KeyRange, it returns the key being minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<string>} A promise of the key relevant to the query.
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
     * Returns the count of entries in the given range.
     * If the optional query is not given, it returns the count of entries in the object store.
     * If the query is of type KeyRange, it returns the count of entries within the given range.
     * @param {KeyRange} [query]
     * @returns {Promise.<number>}
     */
    async count(query=null) {
        // Unfortunately, we cannot do better than getting keys + counting.
        return (await this.keys(query)).size;
    }

    /**
     * Returns the index of the given name.
     * If the index does not exist, it returns undefined.
     * @param {string} indexName The name of the requested index.
     * @returns {IIndex} The index associated with the given name.
     */
    index(indexName) {
        return this._indices.get(indexName);
    }

    /**
     * This method is not implemented for transactions.
     */
    createIndex() {
        throw 'Cannot create index in transaction';
    }

    /**
     * This method is not implemented for transactions.
     */
    async deleteIndex() {
        throw 'Cannot delete index in transaction';
    }

    /**
     * Alias for abort.
     * @returns {Promise} The promise resolves after successful abortion of the transaction.
     */
    close() {
        return this.abort();
    }

    /**
     * Creates a nested transaction, ensuring read isolation.
     * This makes the current transaction read-only until all sub-transactions have been closed (committed/aborted).
     * The same semantic for commits applies: Only the first transaction that commits will be applied. Subsequent transactions will be conflicted.
     * This behaviour has one exception: If all nested transactions are closed, the outer transaction returns to a normal state and new nested transactions can again be created and committed.
     * @returns {Transaction} The transaction object.
     */
    transaction() {
        const tx = new Transaction(this, this, this._enableWatchdog);
        this._nested.add(tx);
        this._state = Transaction.STATE.NESTED;
        return tx;
    }
}
/** @type {number} Milliseconds to wait until automatically aborting transaction. */
Transaction.WATCHDOG_TIMER = 10000 /*ms*/;
/**
 * The states of a transaction.
 * New transactions are in the state OPEN until they are aborted, committed or a nested transaction is created.
 * Aborted transactions move to the state ABORTED.
 * Committed transactions move to the state COMMITTED,
 * if no other transaction has been applied to the same state.
 * Otherwise, they change their state to CONFLICTED.
 * When creating a nested (not read-isolated) transaction on top of a transaction,
 * the outer transaction moves to the state NESTED until the inner transaction is either aborted or committed.
 * Again, only one inner transaction may be committed.
 * @enum {number}
 */
Transaction.STATE = {
    OPEN: 0,
    COMMITTED: 1,
    ABORTED: 2,
    CONFLICTED: 3,
    NESTED: 4
};
Transaction._instanceCount = 0;
Class.register(Transaction);
