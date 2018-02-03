/**
 * Transactions are created by calling the transaction method on an ObjectStore object.
 * Transactions ensure read-isolation.
 * On a given state, only *one* transaction can be committed successfully.
 * Other transactions based on the same state will end up in a conflicted state if committed.
 * Transactions opened after the successful commit of another transaction will be based on the
 * new state and hence can be committed again.
 * @implements {IObjectStore}
 * @implements {ICommittable}
 */
class Transaction {
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
        this._id = Transaction._instanceCount++;
        this._objectStore = objectStore;
        this._parent = parent;
        /** @type {ICommittable} */
        this._managingBackend = managingBackend || parent;
        this._modified = new Map();
        this._removed = new Set();
        this._originalValues = new Map();
        this._truncated = false;
        this._indices = TransactionIndex.derive(this, parent);

        this._state = Transaction.STATE.OPEN;

        // Keep track of nested transactions.
        /** @type {Set.<Transaction>} */
        this._nested = new Set();
        this._nestedCommitted = false;

        // Handle dependencies due to cross-objectstore transactions.
        /** @type {CombinedTransaction} */
        this._dependency = null;

        this._snapshotManager = new SnapshotManager();

        this._startTime = Date.now();
        this._enableWatchdog = enableWatchdog;
        if (this._enableWatchdog) {
            this._watchdog = setTimeout(() => {
                Log.w(Transaction, `Violation: tx id ${this._id} took longer than expected (still open after ${Transaction.WATCHDOG_TIMER/1000}s), ${this.toString()}.`);
            }, Transaction.WATCHDOG_TIMER);
        }
    }

    /** @type {ObjectStore} */
    get objectStore() {
        return this._objectStore;
    }

    /** @type {boolean} */
    get nested() {
        return this._managingBackend instanceof Transaction;
    }

    /**
     * @type {CombinedTransaction} If existent, a combined transaction encompassing this object.
     */
    get dependency() {
        return this._dependency;
    }

    /** @type {boolean} */
    get connected() {
        return this._managingBackend.connected;
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
            throw new Error('Can only apply transactions');
        }

        // First handle snapshots.
        await this._snapshotManager.applyTx(tx, this);

        this._applySync(tx);
    }

    /**
     * Non-async version of _apply that does not update snapshots.
     * Internally applies a transaction to the transaction's state.
     * This needs to be done in batch (as a db level transaction), i.e., either the full state is updated
     * or no changes are applied.
     * @param {Transaction} tx The transaction to apply.
     * @protected
     */
    _applySync(tx) {
        if (tx._truncated) {
            this._truncateSync();
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
        return this._truncateSync();
    }

    /**
     * Non-async variant to empty the object store.
     * @protected
     */
    _truncateSync() {
        if (this._state !== Transaction.STATE.OPEN) {
            throw new Error('Transaction already closed');
        }

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
            if (!this._isCommittable(tx)) {
                await this.abort(tx);
                return false;
            }
            await this._commitInternal(tx);
            return true;
        }

        if (this._dependency !== null) {
            return this._dependency.commit();
        }

        return this._commitBackend();
    }

    /**
     * Commits the transaction to the backend.
     * @returns {Promise.<boolean>} A promise of the success outcome.
     * @protected
     */
    async _commitBackend() {
        if (this._state !== Transaction.STATE.OPEN) {
            throw new Error('Transaction already closed or in nested state');
        }
        if (this._enableWatchdog) {
            clearTimeout(this._watchdog);
        }
        const commitStart = Date.now();
        if (await this._managingBackend.commit(this)) {
            this._state = Transaction.STATE.COMMITTED;
            this._performanceCheck(commitStart, 'commit');
            this._performanceCheck();
            return true;
        } else {
            this._state = Transaction.STATE.CONFLICTED;
            this._performanceCheck(commitStart, 'commit');
            this._performanceCheck();
            return false;
        }
    }

    /**
     * @param {number} [startTime]
     * @param {string} [functionName]
     * @private
     */
    _performanceCheck(startTime=this._startTime, functionName=null) {
        const executionTime = Date.now() - startTime;
        functionName = functionName ? ` function '${functionName}'` : '';
        if (executionTime > Transaction.WATCHDOG_TIMER) {
            Log.w(Transaction, `Violation: tx id ${this._id}${functionName} took ${(executionTime/1000).toFixed(2)}s (${this.toString()}).`);
        }
    }

    /**
     * Is used to probe whether a transaction can be committed.
     * This, for example, includes a check whether another transaction has already been committed.
     * @protected
     * @param {Transaction} [tx] The transaction to be applied, if not given checks for the this transaction.
     * @returns {boolean} Whether a commit will be successful.
     */
    _isCommittable(tx) {
        if (tx !== undefined) {
            // Make sure transaction is based on this transaction.
            if (!this._nested.has(tx) || tx.state !== Transaction.STATE.OPEN) {
                throw new Error('Can only commit open, nested transactions');
            }
            return !this._nestedCommitted;
        }
        return this._managingBackend._isCommittable(this);
    }

    /**
     * Is used to commit the transaction to the in memory state.
     * @protected
     * @param {Transaction} tx The transaction to be applied.
     * @returns {Promise} A promise that resolves upon successful application of the transaction.
     */
    async _commitInternal(tx) {
        this._nested.delete(tx);
        // Apply nested transaction.
        this._nestedCommitted = true;
        await this._apply(tx);
        // If there are no more nested transactions, change back to OPEN state.
        if (this._nested.size === 0) {
            this._state = Transaction.STATE.OPEN;
            this._nestedCommitted = false;
        }
    }

    /**
     * Allows to change the backend of a Transaction when the state has been flushed.
     * @param parent
     * @protected
     */
    _setParent(parent) {
        this._parent = parent;
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
            // Handle snapshots.
            if (tx instanceof Snapshot) {
                return this._snapshotManager.abortSnapshot(tx);
            }

            // Make sure transaction is based on this transaction.
            if (!this._nested.has(tx) || tx.state !== Transaction.STATE.OPEN) {
                throw new Error('Can only abort open, nested transactions');
            }
            this._nested.delete(tx);
            // If there are no more nested transactions, change back to OPEN state.
            if (this._nested.size === 0) {
                this._state = Transaction.STATE.OPEN;
                this._nestedCommitted = false;
            }
            return true;
        }

        if (this._dependency !== null) {
            return this._dependency.abort();
        }

        return this._abortBackend();
    }

    /**
     * Aborts a transaction on the backend.
     * @returns {Promise.<boolean>} A promise of the success outcome.
     */
    async _abortBackend() {
        if (this._state === Transaction.STATE.ABORTED || this._state === Transaction.STATE.CONFLICTED) {
            return true;
        }
        if (this._state !== Transaction.STATE.OPEN && this._state !== Transaction.STATE.NESTED) {
            throw new Error('Transaction already closed');
        }
        if (this._state === Transaction.STATE.NESTED) {
            await Promise.all(Array.from(this._nested).map(tx => tx.abort()));
        }
        if (this._enableWatchdog) {
            clearTimeout(this._watchdog);
        }
        const abortStart = Date.now();
        await this._managingBackend.abort(this);
        this._state = Transaction.STATE.ABORTED;
        this._performanceCheck(abortStart, 'abort');
        this._performanceCheck();
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
        return await this._parent.get(key);
    }

    /**
     * Inserts or replaces a key-value pair.
     * @param {string} key The primary key to associate the value with.
     * @param {*} value The value to write.
     * @returns {Promise} The promise resolves after writing to the current object store finished.
     */
    async put(key, value) {
        if (this._state !== Transaction.STATE.OPEN) {
            throw new Error('Transaction already closed');
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
     * @protected
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
            throw new Error('Transaction already closed');
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
     * @protected
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
            keys = await this._parent.keys(query);
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
     * Iterates over the keys in a given range and direction.
     * The callback is called for each primary key fulfilling the query
     * until it returns false and stops the iteration.
     * @param {function(key:string):boolean} callback A predicate called for each key until returning false.
     * @param {boolean} ascending Determines the direction of traversal.
     * @param {KeyRange} query An optional KeyRange to narrow down the iteration space.
     * @returns {Promise} The promise resolves after all elements have been streamed.
     */
    async keyStream(callback, ascending=true, query=null) {
        // TODO Optimize this sorting step.
        let keys = Array.from(this._modified.keys());
        if (query instanceof KeyRange) {
            keys = keys.filter(key => query.includes(key));
        }
        keys = keys.sort();

        let txIt = keys.iterator(ascending);
        if (!this._truncated) {
            let stopped = false;

            await this._parent.keyStream(key => {
                // Iterate over TxKeys as long as they are smaller (ascending) or larger (descending).
                while (txIt.hasNext() && ((ascending && txIt.peek() < key) || (!ascending && txIt.peek() > key))) {
                    const currentTxKey = txIt.next();
                    if (!callback(currentTxKey)) {
                        // Do not continue iteration.
                        stopped = true;
                        return false;
                    }
                }
                // Special case: what if next key is identical (-> modified)?
                // Present modified version and continue.
                if (txIt.hasNext() && txIt.peek() === key) {
                    const currentTxKey = txIt.next();
                    if (!callback(currentTxKey)) {
                        // Do not continue iteration.
                        stopped = true;
                        return false;
                    }
                    return true;
                }
                // Then give key of the backend's key stream.
                // But only if it hasn't been removed (lazy operator prevents calling callback in this case).
                if (!this._removed.has(key) && !callback(key)) {
                    // Do not continue iteration.
                    stopped = true;
                    return false;
                }
                return true;
            }, ascending, query);

            // Do not continue, if already stopped.
            if (stopped) {
                return;
            }
        }

        // Iterate over the remaining TxKeys.
        while (txIt.hasNext()) {
            if (!callback(txIt.next())) {
                break;
            }
        }
    }

    /**
     * Iterates over the keys and values in a given range and direction.
     * The callback is called for each value and primary key fulfilling the query
     * until it returns false and stops the iteration.
     * @param {function(value:*, key:string):boolean} callback A predicate called for each value and key until returning false.
     * @param {boolean} ascending Determines the direction of traversal.
     * @param {KeyRange} query An optional KeyRange to narrow down the iteration space.
     * @returns {Promise} The promise resolves after all elements have been streamed.
     */
    async valueStream(callback, ascending=true, query=null) {
        // TODO Optimize this sorting step.
        let keys = Array.from(this._modified.keys());
        if (query instanceof KeyRange) {
            keys = keys.filter(key => query.includes(key));
        }
        keys = keys.sort();

        let txIt = keys.iterator(ascending);
        if (!this._truncated) {
            let stopped = false;

            await this._parent.valueStream((value, key) => {
                // Iterate over TxKeys as long as they are smaller (ascending) or larger (descending).
                while (txIt.hasNext() && ((ascending && txIt.peek() < key) || (!ascending && txIt.peek() > key))) {
                    const currentTxKey = txIt.next();
                    const value = this._modified.get(currentTxKey);
                    if (!callback(value, currentTxKey)) {
                        // Do not continue iteration.
                        stopped = true;
                        return false;
                    }
                }
                // Special case: what if next key is identical (-> modified)?
                // Present modified version and continue.
                if (txIt.hasNext() && txIt.peek() === key) {
                    const currentTxKey = txIt.next();
                    const value = this._modified.get(currentTxKey);
                    if (!callback(value, currentTxKey)) {
                        // Do not continue iteration.
                        stopped = true;
                        return false;
                    }
                    return true;
                }
                // Then give key of the backend's key stream.
                // But only if it hasn't been removed (lazy operator prevents calling callback in this case).
                if (!this._removed.has(key) && !callback(value, key)) {
                    // Do not continue iteration.
                    stopped = true;
                    return false;
                }
                return true;
            }, ascending, query);

            // Do not continue, if already stopped.
            if (stopped) {
                return;
            }
        }

        // Iterate over the remaining TxKeys.
        while (txIt.hasNext()) {
            const key = txIt.next();
            const value = await this.get(key);
            if (!callback(value, key)) {
                break;
            }
        }
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
            maxKey = await this._parent.maxKey(query);
        }

        // If this key has been removed, find next best key.
        while (maxKey !== undefined && this._removed.has(maxKey)) {
            const tmpQuery = KeyRange.upperBound(maxKey, true);
            maxKey = await this._parent.maxKey(tmpQuery);

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
            minKey = await this._parent.minKey(query);
        }

        // If this key has been removed, find next best key.
        while (minKey !== undefined && this._removed.has(minKey)) {
            const tmpQuery = KeyRange.lowerBound(minKey, true);
            minKey = await this._parent.minKey(tmpQuery);

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
        throw new Error('Cannot create index in transaction');
    }

    /**
     * This method is not implemented for transactions.
     */
    async deleteIndex() {
        throw new Error('Cannot delete index in transaction');
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
     * @param {boolean} [enableWatchdog]
     * @returns {Transaction} The transaction object.
     */
    transaction(enableWatchdog = true) {
        if (this._state !== Transaction.STATE.OPEN && this._state !== Transaction.STATE.NESTED) {
            throw new Error('Transaction already closed');
        }
        const tx = new Transaction(this._objectStore, this, this, enableWatchdog);
        this._nested.add(tx);
        this._state = Transaction.STATE.NESTED;
        return tx;
    }

    /**
     * Creates an in-memory snapshot of this state.
     * This snapshot only maintains the differences between the state at the time of the snapshot
     * and the current state.
     * To stop maintaining the snapshot, it has to be aborted.
     * @returns {Snapshot}
     */
    snapshot() {
        if (this.state !== Transaction.STATE.COMMITTED) {
            const snapshot = this._managingBackend.snapshot();
            snapshot.inherit(this);
            return snapshot;
        }
        return this._snapshotManager.createSnapshot(this._objectStore, this);
    }

    toString() {
        return `Transaction{id=${this._id}, changes=±${this._modified.size+this._removed.size}, truncated=${this._truncated}, objectStore=${this._objectStore}, state=${this._state}, dependency=${this._dependency}}`;
    }

    toStringShort() {
        return `Transaction{id=${this._id}, changes=±${this._modified.size+this._removed.size}, truncated=${this._truncated}, state=${this._state}, dependency=${this._dependency}}`;
    }
}
/** @type {number} Milliseconds to wait until automatically aborting transaction. */
Transaction.WATCHDOG_TIMER = 5000 /*ms*/;
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
