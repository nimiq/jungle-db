/**
 * This is the main implementation of an object store.
 * It uses a specified backend (which itself implements the very same interface)
 * and builds upon this backend to answer queries.
 * The main task of this object store is to manage transactions
 * and ensure read isolation on these transactions.
 * @implements {IObjectStore}
 * @implements {ICommittable}
 */
class ObjectStore {
    /**
     * Creates a new object store based on a backend and an underlying database.
     * The database is only used to determine the connection status.
     * @param {IBackend} backend The backend underlying this object store.
     * @param {JungleDB} db The database underlying the backend.
     * @param {string} [name] The name of the object store if existent.
     */
    constructor(backend, db, name) {
        this._backend = backend;
        this._db = db;
        this._name = name;
        /** @type {Array.<TransactionInfo>} */
        this._stateStack = [];
        this._backendInfo = new TransactionInfo(this._backend, null);
        /**
         * Maps transactions to their TransactionInfo objects.
         * @type {Map.<number|string,TransactionInfo>}
         */
        this._transactions = new Map();
        this._transactions.set(ObjectStore.BACKEND_ID, this._backendInfo);

        /**
         * The set of currently open snapshots.
         * @type {Set.<Snapshot>}
         */
        this._snapshotManager = new SnapshotManager();

        this._synchronizer = new Synchronizer();
    }

    /** @type {JungleDB} */
    get jungleDB() {
        return this._db;
    }

    /** @type {boolean} */
    get connected() {
        return this._backend.connected;
    }

    /** @type {IObjectStore} */
    get _currentState() {
        return this._stateStack.length > 0 ? this._stateStack[this._stateStack.length - 1].transaction : this._backend;
    }

    /** @type {TransactionInfo} */
    get _currentStateInfo() {
        return this._stateStack.length > 0 ? this._stateStack[this._stateStack.length - 1] : this._backendInfo;
    }

    /** @type {number|string} */
    get _currentStateId() {
        return this._stateStack.length > 0 ? this._stateStack[this._stateStack.length - 1].id : ObjectStore.BACKEND_ID;
    }

    /**
     * A map of index names to indices.
     * The index names can be used to access an index.
     * @type {Map.<string,IIndex>}
     */
    get indices() {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        return this._currentState.indices;
    }

    /**
     * Returns a promise of the object stored under the given primary key.
     * Resolves to undefined if the key is not present in the object store.
     * @param {string} key The primary key to look for.
     * @returns {Promise.<*>} A promise of the object stored under the given key, or undefined if not present.
     */
    get(key) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        return this._currentState.get(key);
    }

    /**
     * Inserts or replaces a key-value pair.
     * Implicitly creates a transaction for this operation and commits it.
     * @param {string} key The primary key to associate the value with.
     * @param {*} value The value to write.
     * @returns {Promise.<boolean>} A promise of the success outcome.
     */
    async put(key, value) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        const tx = this.transaction();
        try {
            await tx.put(key, value);
        } catch (err) {
            await tx.abort();
            throw err;
        }
        return tx.commit();
    }

    /**
     * Removes the key-value pair of the given key from the object store.
     * Implicitly creates a transaction for this operation and commits it.
     * @param {string} key The primary key to delete along with the associated object.
     * @returns {Promise.<boolean>} A promise of the success outcome.
     */
    async remove(key) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        const tx = this.transaction();
        try {
            await tx.remove(key);
        } catch (err) {
            await tx.abort();
            throw err;
        }
        return tx.commit();
    }

    /**
     * Returns the object stored under the given primary key.
     * Resolves to undefined if the key is not present in the object store.
     * @param {string} key The primary key to look for.
     * @returns {*} The object stored under the given key, or undefined if not present.
     */
    getSync(key) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        if (!this._currentState.isSynchronous()) throw new Error('Only works on synchronous backends');
        return this._currentState.getSync(key);
    }

    /**
     * A check whether a certain key is cached.
     * @param {string} key The key to check.
     * @return {boolean} A boolean indicating whether the key is already in the cache.
     */
    isCached(key) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        if (!this._currentState.isSynchronous()) throw new Error('Only works on synchronous backends');
        return this._currentState.isCached(key);
    }

    /**
     * Returns a promise of a set of keys fulfilling the given query.
     * If the optional query is not given, it returns all keys in the object store.
     * If the query is of type KeyRange, it returns all keys of the object store being within this range.
     * If the query is of type Query, it returns all keys fulfilling the query.
     * @param {Query|KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Set.<string>>} A promise of the set of keys relevant to the query.
     */
    keys(query=null) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        if (query !== null && query instanceof Query) {
            return query.keys(this._currentState);
        }
        return this._currentState.keys(query);
    }

    /**
     * Returns a promise of an array of objects whose primary keys fulfill the given query.
     * If the optional query is not given, it returns all objects in the object store.
     * If the query is of type KeyRange, it returns all objects whose primary keys are within this range.
     * If the query is of type Query, it returns all objects whose primary keys fulfill the query.
     * @param {Query|KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Array.<*>>} A promise of the array of objects relevant to the query.
     */
    values(query=null) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        if (query !== null && query instanceof Query) {
            return query.values(this._currentState);
        }
        return this._currentState.values(query);
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
    keyStream(callback, ascending=true, query=null) {
        return this._currentState.keyStream(callback, ascending, query);
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
    valueStream(callback, ascending=true, query=null) {
        return this._currentState.valueStream(callback, ascending, query);
    }

    /**
     * Returns a promise of the object whose primary key is maximal for the given range.
     * If the optional query is not given, it returns the object whose key is maximal.
     * If the query is of type KeyRange, it returns the object whose primary key is maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<*>} A promise of the object relevant to the query.
     */
    maxValue(query=null) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        return this._currentState.maxValue(query);
    }

    /**
     * Returns a promise of the key being maximal for the given range.
     * If the optional query is not given, it returns the maximal key.
     * If the query is of type KeyRange, it returns the key being maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<string>} A promise of the key relevant to the query.
     */
    maxKey(query=null) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        return this._currentState.maxKey(query);
    }

    /**
     * Returns a promise of the key being minimal for the given range.
     * If the optional query is not given, it returns the minimal key.
     * If the query is of type KeyRange, it returns the key being minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<string>} A promise of the key relevant to the query.
     */
    minKey(query=null) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        return this._currentState.minKey(query);
    }

    /**
     * Returns a promise of the object whose primary key is minimal for the given range.
     * If the optional query is not given, it returns the object whose key is minimal.
     * If the query is of type KeyRange, it returns the object whose primary key is minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<*>} A promise of the object relevant to the query.
     */
    minValue(query=null) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        return this._currentState.minValue(query);
    }

    /**
     * Returns the count of entries in the given range.
     * If the optional query is not given, it returns the count of entries in the object store.
     * If the query is of type KeyRange, it returns the count of entries within the given range.
     * @param {KeyRange} [query]
     * @returns {Promise.<number>}
     */
    count(query=null) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        return this._currentState.count(query);
    }

    /**
     * This method is only used by transactions internally to commit themselves to the corresponding object store.
     * Thus, the tx argument is non-optional.
     * A call to this method checks whether the given transaction can be applied and pushes it to
     * the stack of applied transactions. When there is no other transaction requiring to enforce
     * read isolation, the state will be flattened and all transactions will be applied to the backend.
     * @param {Transaction} tx The transaction to be applied.
     * @returns {Promise.<boolean>} A promise of the success outcome.
     * @protected
     */
    async commit(tx) {
        if (!this._isCommittable(tx)) {
            await this.abort(tx);
            return false;
        }
        await this._commitInternal(tx);
        return true;
    }

    /**
     * Is used to probe whether a transaction can be committed.
     * This, for example, includes a check whether another transaction has already been committed.
     * @protected
     * @param {Transaction} tx The transaction to be applied.
     * @returns {boolean} Whether a commit will be successful.
     */
    _isCommittable(tx) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        if (!(tx instanceof Transaction) || tx.state !== Transaction.STATE.OPEN || !this._transactions.has(tx.id)) {
            throw new Error('Can only commit open transactions');
        }

        const info = this._transactions.get(tx.id);

        // Another transaction was already committed.
        return info.isCommittable();
    }

    /**
     * Commits the transaction to the backend.
     * @returns {Promise.<boolean>} A promise of the success outcome.
     * @protected
     */
    async _commitBackend() {
        throw new Error('Cannot commit object stores');
    }

    /**
     * Is used to commit the transaction.
     * @protected
     * @param {Transaction} tx The transaction to be applied.
     * @returns {Promise} A promise that resolves upon successful application of the transaction.
     */
    async _commitInternal(tx) {
        const info = this._transactions.get(tx.id);

        // Create new layer on stack (might be immediately removed by a state flattening).
        if (this._stateStack.length >= ObjectStore.MAX_STACK_SIZE) {
            Log.e(ObjectStore, `Transaction stack size exceeded ${this.toStringFull()}`);
            throw new Error('Transaction stack size exceeded');
        }
        this._stateStack.push(info);
        info.close();

        // If this is the last transaction, we push our changes to the underlying layer.
        // This only works if the given transaction does not have dependencies or the current state is the backend.
        if (info.isFlushable()) {
            // The underlying layer *has to be* the last one in our stack.
            await this._flattenState(tx);
        }
    }

    /**
     * Allows to change the backend of a Transaction when the state has been flushed.
     * @param parent
     * @protected
     */
    _setParent(parent) {
        throw new Error('Unsupported operation');
    }

    /**
     * This method is only used by transactions internally to abort themselves at the corresponding object store.
     * Thus, the tx argument is non-optional.
     * @param {Transaction} tx The transaction to be aborted.
     * @returns {Promise.<boolean>} A promise of the success outcome.
     * @protected
     */
    async abort(tx) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');

        if (tx instanceof Snapshot) {
            return this._snapshotManager.abortSnapshot(tx);
        }

        if (!(tx instanceof Transaction) || tx.state !== Transaction.STATE.OPEN || !this._transactions.has(tx.id)) {
            throw new Error('Can only abort open transactions');
        }
        const info = this._transactions.get(tx.id);
        info.abort();

        // If this abortion resolves a conflict, try flattening the state.
        if (info.parent && info.parent.numOpenChildren === 0) {
            await this._flattenState();
        }
        return true;
    }

    /**
     * This internal method applies a transaction to the current state
     * and tries flattening the stack of transactions.
     * @param {Transaction} [tx] An optional transaction to apply to the current state.
     * @returns {Promise.<boolean>} If a tx is given, this boolean indicates whether the state has been merged.
     * If tx is not given, the return value is false and does not convey a meaning.
     * @private
     */
    _flattenState(tx) {
        return this._synchronizer.push(() => this._flattenStateInternal(tx));
    }

    /**
     * This internal method applies a transaction to the current state
     * and tries flattening the stack of transactions.
     * @param {Transaction} [tx] An optional transaction to apply to the current state.
     * @returns {Promise.<boolean>} If a tx is given, this boolean indicates whether the state has been merged.
     * If tx is not given, the return value is false and does not convey a meaning.
     * @private
     */
    async _flattenStateInternal(tx) {
        // If there is a tx argument, merge it with the current state.
        if (tx && (tx instanceof Transaction)) {
            // Check whether the state can be flattened.
            // For this, the following conditions have to hold:
            // 1. the base state does not have open transactions
            const info = this._transactions.get(tx.id);
            if (!info.isFlushable()) {
                return false;
            }

            // Applying is possible.
            // We apply it first and upon successful application, we update transactions.
            // This way, we ensure that intermediate reads still work and that transactions
            // are still consistent even if the application fails.
            const backend = info.parent.transaction;
            const cleanup = () => {
                // Change pointers in child transactions.
                info.flush();
                this._transactions.delete(tx.id);

                // Look for tx on stack and remove it.
                const statePosition = this._stateStack.indexOf(info);
                if (statePosition >= 0) {
                    this._stateStack.splice(statePosition, 1);
                }

                this._flattenState().catch(Log.w.tag(ObjectStore));
            };

            if (tx.dependency === null) {
                // If we apply to the backend, update the snapshots.
                if (info.parent.isBackend()) {
                    await this._snapshotManager.applyTx(tx, backend);
                }
                try {
                    await backend._apply(tx);
                } catch (err) {
                    // Change pointers in child transactions.
                    info.abort();
                    this._transactions.delete(tx.id);

                    // Look for tx on stack and remove it.
                    const statePosition = this._stateStack.indexOf(info);
                    if (statePosition >= 0) {
                        this._stateStack.splice(statePosition, 1);
                    }
                    tx._setAborted();
                    Log.w(ObjectStore, 'Error while applying transaction');
                }
                cleanup();
                return true;
            } else {
                // We apply to the backend, so also update snapshots before the flush.
                return await tx.dependency.onFlushable(tx, cleanup, () => this._snapshotManager.applyTx(tx, backend));
            }
        } else {
            // Check both ends of the stack.
            // Start with the easy part: The last state.
            // Start flattening at the end.
            while (this._stateStack.length > 0) {
                if (!(await this._flattenStateInternal(this._currentState))) {
                    break;
                }
            }
            // Then try flattening from the start.
            while (this._stateStack.length > 0) {
                if (!(await this._flattenStateInternal(this._stateStack[0].transaction))) {
                    break;
                }
            }
            return false;
        }
    }

    /**
     * Returns the index of the given name.
     * If the index does not exist, it returns undefined.
     * @param {string} indexName The name of the requested index.
     * @returns {IIndex} The index associated with the given name.
     */
    index(indexName) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        return this._currentState.index(indexName);
    }

    /**
     * Creates a new secondary index on the object store.
     * Currently, all secondary indices are non-unique.
     * They are defined by a key within the object or alternatively a path through the object to a specific subkey.
     * For example, ['a', 'b'] could be used to use 'key' as the key in the following object:
     * { 'a': { 'b': 'key' } }
     * Secondary indices may be multiEntry, i.e., if the keyPath resolves to an iterable object, each item within can
     * be used to find this entry.
     * If a new object does not possess the key path associated with that index, it is simply ignored.
     *
     * This function may only be called before the database is connected.
     * Moreover, it is only executed on database version updates or on first creation.
     * @param {string} indexName The name of the index.
     * @param {string|Array.<string>} [keyPath] The path to the key within the object. May be an array for multiple levels.
     * @param {{multiEntry:?boolean, unique:?boolean, upgradeCondition:?boolean|?function(oldVersion:number, newVersion:number):boolean}} [options] An options object.
     */
    createIndex(indexName, keyPath, options = {}) {
        return this._backend.createIndex(indexName, keyPath, options);
    }

    /**
     * Deletes a secondary index from the object store.
     * @param indexName
     * @param {{upgradeCondition:?boolean|?function(oldVersion:number, newVersion:number):boolean}} [options]
     */
    deleteIndex(indexName, options = {}) {
        return this._backend.deleteIndex(indexName, options);
    }

    /**
     * Creates a new transaction, ensuring read isolation
     * on the most recently successfully committed state.
     * @param {boolean} [enableWatchdog]
     * @returns {Transaction} The transaction object.
     */
    transaction(enableWatchdog=true) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');

        // Prefer synchronous transactions.
        if (this._backend.isSynchronous()) return this.synchronousTransaction(enableWatchdog);

        const tx = new Transaction(this, this._currentState, this, enableWatchdog);
        this._transactions.set(tx.id, new TransactionInfo(tx, this._currentStateInfo));
        return tx;
    }

    /**
     * Creates a new synchronous transaction, ensuring read isolation
     * on the most recently successfully committed state.
     *
     * WARNING: If not all required key-value-pairs are preloaded, the results of any call on a synchronous transaction
     * might be wrong. Only use synchronous transactions, if unavoidable.
     * @param {boolean} [enableWatchdog]
     * @returns {SynchronousTransaction} The synchronous transaction object.
     */
    synchronousTransaction(enableWatchdog=true) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        const tx = new SynchronousTransaction(this, this._currentState, this, enableWatchdog);
        this._transactions.set(tx.id, new TransactionInfo(tx, this._currentStateInfo));
        return tx;
    }

    /**
     * Checks whether an object store implements the ISynchronousObjectStore interface.
     * @returns {boolean} The transaction object.
     */
    isSynchronous() {
        return this._backend.isSynchronous();
    }

    /**
     * Creates an in-memory snapshot of the current state.
     * This snapshot only maintains the differences between the state at the time of the snapshot
     * and the current state.
     * To stop maintaining the snapshot, it has to be aborted.
     * @returns {Snapshot}
     */
    snapshot() {
        if (this._currentStateId !== ObjectStore.BACKEND_ID) {
            return this._currentState.snapshot();
        }
        return this._snapshotManager.createSnapshot(this, this._currentState);
    }

    /**
     * An object store is strongly connected to a backend.
     * Hence, it does not store anything by itself and the _apply method is not supported.
     * @param {Transaction} tx
     * @returns {Promise.<boolean>}
     * @protected
     */
    async _apply(tx) {
        throw new Error('Unsupported operation');
    }

    /**
     * Empties the object store.
     * @returns {Promise} The promise resolves after emptying the object store.
     */
    async truncate() {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        const tx = this.transaction();
        await tx.truncate();
        return tx.commit();
    }

    /**
     * Closes the object store and potential connections.
     * @returns {Promise} The promise resolves after closing the object store.
     */
    close() {
        // TODO perhaps use a different strategy here
        if (this._stateStack.length > 0) {
            throw new Error('Cannot close database while transactions are active');
        }
        return this._backend.close();
    }

    toStringFull() {
        return `ObjectStore{
    stack=[${this._stateStack.map(tx => `{tx=${tx.toStringShort()}, open=${this._openTransactions.get(tx.id) ? this._openTransactions.get(tx.id).size : 0}}`)}],
    db=${this._db}/${this._name ? this._name : 'unnamed'}
}`;
    }

    toString() {
        return `ObjectStore{stackSize=${this._stateStack.length}, db=${this._db}/${this._name ? this._name : 'unnamed'}}`;
    }
}
/** @type {number} The maximum number of states to stack. */
ObjectStore.MAX_STACK_SIZE = 10;
ObjectStore.BACKEND_ID = 'backend';
Class.register(ObjectStore);

class TransactionInfo {
    /**
     * @param {Transaction} transaction
     * @param {TransactionInfo} parentInfo
     * @param {Array.<TransactionInfo>} children
     */
    constructor(transaction, parentInfo, children = []) {
        this.transaction = transaction;
        this.children = children;
        this._parentInfo = parentInfo;
        this._open = true;

        if (this._parentInfo) {
            this._parentInfo.addChild(this);
        }
    }

    /**
     * @param {TransactionInfo} transaction
     */
    addChild(transaction) {
        this.children.push(transaction);
    }

    /**
     * @param {TransactionInfo} transaction
     */
    removeChild(transaction) {
        const i = this.children.indexOf(transaction);
        if (i >= 0) {
            this.children.splice(i, 1);
        }
    }

    flush() {
        if (!this.isBackend()) {
            const parent = this.parent;
            this.parent.removeChild(this);
            for (const /** @type {TransactionInfo} */ child of this.children.slice()) {
                child.parent = parent;
            }
            this.children = [];
            this._parentInfo = null;
        }
    }

    abort() {
        if (!this.isBackend()) {
            this.parent.removeChild(this);
        }
    }

    close() {
        this._open = false;
    }

    /** @type {TransactionInfo} */
    get parent() {
        return this._parentInfo;
    }

    /**
     * @param {TransactionInfo} parent
     */
    set parent(parent) {
        this.parent.removeChild(this);
        this._parentInfo = parent;
        this.parent.addChild(this);
        this.transaction._setParent(parent.transaction);
    }

    /** @type {number} */
    get id() {
        return this.isBackend() ? ObjectStore.BACKEND_ID : this.transaction.id;
    }

    /**
     * @returns {boolean}
     */
    isBackend() {
        return this._parentInfo === null;
    }

    /**
     * @returns {boolean}
     */
    isOpen() {
        return this._open;
    }

    /**
     * @type {number}
     */
    get numOpenChildren() {
        return this.children.filter(child => child.isOpen()).length;
    }


    /**
     * @returns {*|boolean}
     */
    isCommittable() {
        return this._parentInfo && this._parentInfo.children.every(child => child.isOpen());
    }

    /**
     * @returns {boolean}
     */
    isFlushable() {
        return this.parent && this.parent.numOpenChildren === 0 && (this.transaction.dependency === null || this.parent.isBackend());
    }
}
