/**
 * This is the main implementation of an object store.
 * It uses a specified backend (which itself implements the very same interface)
 * and builds upon this backend to answer queries.
 * The main task of this object store is to manage transactions
 * and ensure read isolation on these transactions.
 * @implements {IObjectStore}
 */
class ObjectStore {
    /**
     * Creates a new object store based on a backend and an underlying database.
     * The database is only used to determine the connection status.
     * @param {IObjectStore} backend The backend underlying this object store.
     * @param {{connected:boolean}} db The database underlying the backend.
     */
    constructor(backend, db) {
        this._backend = backend;
        this._db = db;
        /** @type {Array.<Transaction>} */
        this._stateStack = [];
        /**
         * Maps transactions to their base states.
         * @type {Map.<number|string,number>}
         */
        this._txBaseStates = new Map();
        /**
         * Counter for number of open transactions for base states.
         * @type {Object}
         */
        this._openTransactions = Object.create(null);
        /**
         * Set of base states already committed to.
         * @type {Set.<number|string>}
         */
        this._closedBaseStates = new Set();
    }

    /** @type {IObjectStore} */
    get _currentState() {
        return this._stateStack.length > 0 ? this._stateStack[this._stateStack.length - 1] : this._backend;
    }

    /** @type {number|string} */
    get _currentStateId() {
        return this._stateStack.length > 0 ? this._stateStack[this._stateStack.length - 1].id : 'backend';
    }

    /**
     * A map of index names to indices.
     * The index names can be used to access an index.
     * @type {Map.<string,IIndex>}
     */
    get indices() {
        if (!this._db.connected) throw 'JungleDB is not connected';
        return this._currentState.indices;
    }

    /**
     * Returns a promise of the object stored under the given primary key.
     * Resolves to undefined if the key is not present in the object store.
     * @param {string} key The primary key to look for.
     * @param {function(obj:*):*} [decoder] Optional decoder function overriding the object store's default (null is the identity decoder).
     * @returns {Promise.<*>} A promise of the object stored under the given key, or undefined if not present.
     */
    get(key, decoder=undefined) {
        if (!this._db.connected) throw 'JungleDB is not connected';
        return this._currentState.get(key, decoder);
    }

    /**
     * Inserts or replaces a key-value pair.
     * Implicitly creates a transaction for this operation and commits it.
     * @param {string} key The primary key to associate the value with.
     * @param {*} value The value to write.
     * @returns {Promise.<boolean>} A promise of the success outcome.
     */
    async put(key, value) {
        if (!this._db.connected) throw 'JungleDB is not connected';
        const tx = this.transaction();
        await tx.put(key, value);
        return tx.commit();
    }

    /**
     * Removes the key-value pair of the given key from the object store.
     * Implicitly creates a transaction for this operation and commits it.
     * @param {string} key The primary key to delete along with the associated object.
     * @returns {Promise.<boolean>} A promise of the success outcome.
     */
    async remove(key) {
        if (!this._db.connected) throw 'JungleDB is not connected';
        const tx = this.transaction();
        await tx.remove(key);
        return tx.commit();
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
        if (!this._db.connected) throw 'JungleDB is not connected';
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
     * @param {function(obj:*):*} [decoder] Optional decoder function overriding the object store's default (null is the identity decoder).
     * @returns {Promise.<Array.<*>>} A promise of the array of objects relevant to the query.
     */
    values(query=null, decoder=undefined) {
        if (!this._db.connected) throw 'JungleDB is not connected';
        if (query !== null && query instanceof Query) {
            return query.values(this._currentState, decoder);
        }
        return this._currentState.values(query, decoder);
    }

    /**
     * Returns a promise of the object whose primary key is maximal for the given range.
     * If the optional query is not given, it returns the object whose key is maximal.
     * If the query is of type KeyRange, it returns the object whose primary key is maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @param {function(obj:*):*} [decoder] Optional decoder function overriding the object store's default (null is the identity decoder).
     * @returns {Promise.<*>} A promise of the object relevant to the query.
     */
    maxValue(query=null, decoder=undefined) {
        if (!this._db.connected) throw 'JungleDB is not connected';
        return this._currentState.maxValue(query, decoder);
    }

    /**
     * Returns a promise of the key being maximal for the given range.
     * If the optional query is not given, it returns the maximal key.
     * If the query is of type KeyRange, it returns the key being maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<string>} A promise of the key relevant to the query.
     */
    maxKey(query=null) {
        if (!this._db.connected) throw 'JungleDB is not connected';
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
        if (!this._db.connected) throw 'JungleDB is not connected';
        return this._currentState.minKey(query);
    }

    /**
     * Returns a promise of the object whose primary key is minimal for the given range.
     * If the optional query is not given, it returns the object whose key is minimal.
     * If the query is of type KeyRange, it returns the object whose primary key is minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @param {function(obj:*):*} [decoder] Optional decoder function overriding the object store's default (null is the identity decoder).
     * @returns {Promise.<*>} A promise of the object relevant to the query.
     */
    minValue(query=null, decoder=undefined) {
        if (!this._db.connected) throw 'JungleDB is not connected';
        return this._currentState.minValue(query, decoder);
    }

    /**
     * Returns the count of entries in the given range.
     * If the optional query is not given, it returns the count of entries in the object store.
     * If the query is of type KeyRange, it returns the count of entries within the given range.
     * @param {KeyRange} [query]
     * @returns {Promise.<number>}
     */
    count(query=null) {
        if (!this._db.connected) throw 'JungleDB is not connected';
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
        if (!this._db.connected) throw 'JungleDB is not connected';
        if (!(tx instanceof Transaction) || tx.state !== Transaction.STATE.OPEN || !this._txBaseStates.has(tx.id)) {
            throw 'Can only commit open transactions';
        }
        const baseState = this._txBaseStates.get(tx.id);

        // Another transaction was already committed.
        if (this._closedBaseStates.has(baseState)) {
            await this.abort(tx);
            return false;
        }

        const numOpenTransactions = --this._openTransactions[baseState];

        // If this is the last transaction, we push our changes to the underlying layer.
        if (numOpenTransactions === 0) {
            // The underlying layer *has to be* the last one in our stack.
            await this._flattenState(tx);
        } else {
            // Otherwise, create new layer on stack.
            if (this._stateStack.length >= ObjectStore.MAX_STACK_SIZE) {
                throw 'Transaction stack size exceeded';
            }
            this._stateStack.push(tx);
            this._openTransactions[tx.id] = 0;
            this._closedBaseStates.add(baseState);
        }
        return true;
    }

    /**
     * This method is only used by transactions internally to abort themselves at the corresponding object store.
     * Thus, the tx argument is non-optional.
     * @param {Transaction} tx The transaction to be aborted.
     * @returns {Promise.<boolean>} A promise of the success outcome.
     * @protected
     */
    async abort(tx) {
        if (!this._db.connected) throw 'JungleDB is not connected';
        if (!(tx instanceof Transaction) || tx.state !== Transaction.STATE.OPEN || !this._txBaseStates.has(tx.id)) {
            throw 'Can only abort open transactions';
        }
        const baseState = this._txBaseStates.get(tx.id);

        const numOpenTransactions = --this._openTransactions[baseState];
        this._txBaseStates.delete(tx.id);

        if (numOpenTransactions === 0) {
            await this._flattenState();
        }
        return true;
    }

    /**
     * This internal method applies a transaction to the current state
     * and tries flattening the stack of transactions.
     * @param {Transaction} [tx] An optional transaction to apply to the current state.
     * @private
     */
    async _flattenState(tx) {
        // If there is a tx argument, merge it with the current state.
        if (tx && (tx instanceof Transaction)) {
            // TODO maybe get around calling a private method here
            await this._currentState._apply(tx);
        }
        // Try collapsing the states as far as possible.
        if (this._openTransactions[this._currentState.id] > 0) {
            // The current state has open transactions,
            // no way to flatten state here.
            return;
        }
        // Start flattening at the end.
        while (this._stateStack.length > 0) {
            const currentState = this._currentState;
            const baseState = this._txBaseStates.get(currentState.id);
            // Check whether it is collapsible, if no stop here.
            if (this._openTransactions[baseState] > 0) {
                break;
            }
            this._txBaseStates.delete(currentState.id);
            this._stateStack.pop(); // Remove the current state from the stack.
            await this._currentState._apply(currentState); // And apply it to the underlying layer.
        }
    }

    /**
     * Returns the index of the given name.
     * If the index does not exist, it returns undefined.
     * @param {string} indexName The name of the requested index.
     * @returns {IIndex} The index associated with the given name.
     */
    index(indexName) {
        if (!this._db.connected) throw 'JungleDB is not connected';
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
     * @param {boolean} [multiEntry]
     */
    createIndex(indexName, keyPath, multiEntry=false) {
        return this._backend.createIndex(indexName, keyPath, multiEntry);
    }

    /**
     * Deletes a secondary index from the object store.
     * @param indexName
     * @returns {Promise} The promise resolves after deleting the index.
     */
    deleteIndex(indexName) {
        return this._backend.deleteIndex(indexName);
    }

    /**
     * Creates a new transaction, ensuring read isolation
     * on the most recently successfully commited state.
     * @returns {Transaction} The transaction object.
     */
    transaction() {
        if (!this._db.connected) throw 'JungleDB is not connected';
        const tx = new Transaction(this._currentState, this);
        this._txBaseStates.set(tx.id, this._currentStateId);
        this._openTransactions[this._currentStateId] = this._openTransactions[this._currentStateId] ? this._openTransactions[this._currentStateId] + 1 : 1;
        return tx;
    }

    /**
     * An object store is strongly connected to a backend.
     * Hence, it does not store anything by itself and the _apply method is not supported.
     * @param {Transaction} tx
     * @returns {Promise.<boolean>}
     * @protected
     */
    async _apply(tx) {
        throw 'Unsupported operation';
    }

    /**
     * Empties the object store.
     * @returns {Promise} The promise resolves after emptying the object store.
     */
    async truncate() {
        if (!this._db.connected) throw 'JungleDB is not connected';
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
            throw 'Cannot close database while transactions are active';
        }
        return this._backend.close();
    }

    /**
     * Internal method called to decode a single value.
     * @param {*} value Value to be decoded.
     * @param {function(obj:*):*} [decoder] Optional decoder function overriding the object store's default (null is the identity decoder).
     * @returns {*} The decoded value, either by the object store's default or the overriding decoder if given.
     */
    decode(value, decoder=undefined) {
        return this._backend.decode(value, decoder);
    }

    /**
     * Internal method called to decode multiple values.
     * @param {Array.<*>} values Values to be decoded.
     * @param {function(obj:*):*} [decoder] Optional decoder function overriding the object store's default (null is the identity decoder).
     * @returns {Array.<*>} The decoded values, either by the object store's default or the overriding decoder if given.
     */
    decodeArray(values, decoder=undefined) {
        return this._backend.decodeArray(values, decoder);
    }
}
/** @type {number} The maximum number of states to stack. */
ObjectStore.MAX_STACK_SIZE = 10;
Class.register(ObjectStore);
