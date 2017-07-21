/**
 * @implements {IObjectStore}
 */
class ObjectStore {
    /**
     * @param {IObjectStore} backend
     */
    constructor(backend) {
        this._backend = backend;
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
     * @type {Map.<string,IIndex>}
     */
    get indices() {
        return this._currentState.indices;
    }

    /**
     * @param {string} key
     * @returns {Promise.<*>}
     */
    get(key) {
        return this._currentState.get(key);
    }

    /**
     * @param {string} key
     * @param {*} value
     * @returns {Promise}
     */
    async put(key, value) {
        const tx = this.transaction();
        await tx.put(key, value);
        return tx.commit();
    }

    /**
     * @param {string} key
     * @returns {Promise}
     */
    async remove(key) {
        const tx = this.transaction();
        await tx.remove(key);
        return tx.commit();
    }

    /**
     * @param {Query|KeyRange} [query]
     * @returns {Promise.<Array.<string>>}
     */
    keys(query=null) {
        if (query !== null && query instanceof Query) {
            return query.keys(this._currentState);
        }
        return this._currentState.keys(query);
    }

    /**
     * @param {Query|KeyRange} [query]
     * @returns {Promise.<Array.<*>>}
     */
    values(query=null) {
        if (query !== null && query instanceof Query) {
            return query.values(this._currentState);
        }
        return this._currentState.values(query);
    }

    /**
     * @abstract
     * @param {KeyRange|*} [query]
     * @returns {Promise.<*>}
     */
    maxValue(query=null) {
        return this._currentState.maxValue(query);
    }

    /**
     * @param {KeyRange|*} [query]
     * @returns {Promise.<string>>}
     */
    maxKey(query=null) {
        return this._currentState.maxKey(query);
    }

    /**
     * @param {KeyRange|*} [query]
     * @returns {Promise.<string>>}
     */
    minKey(query=null) {
        return this._currentState.minKey(query);
    }

    /**
     * @param {KeyRange|*} [query]
     * @returns {Promise.<*>}
     */
    minValue(query=null) {
        return this._currentState.minValue(query);
    }

    /**
     * @param {KeyRange|*} [query]
     * @returns {Promise.<Array.<string>>}
     */
    count(query=null) {
        return this._currentState.count(query);
    }

    /**
     * @param {Transaction} [tx]
     * @returns {Promise.<boolean>}
     */
    async commit(tx) {
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
            return this._flattenState(tx);
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
     * @param {Transaction} [tx]
     */
    async abort(tx) {
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
     * @param {Transaction} [tx]
     * @private
     */
    async _flattenState(tx) {
        // If there is a tx argument, merge it with the current state.
        if (tx && (tx instanceof Transaction)) {
            // TODO maybe get around calling a private method here
            this._currentState._apply(tx);
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
            this._currentState._apply(currentState); // And apply it to the underlying layer.
        }
    }

    /**
     * @param {string} indexName
     * @returns {IIndex}
     */
    index(indexName) {
        return this._currentState.index(indexName);
    }

    /**
     * @param {string} indexName
     * @param {string|Array.<string>} [keyPath]
     * @param {boolean} [multiEntry]
     */
    createIndex(indexName, keyPath, multiEntry=false) {
        return this._backend.createIndex(indexName, keyPath, multiEntry);
    }

    /**
     * @returns {Transaction}
     */
    transaction() {
        const tx = new Transaction(this._currentState, this);
        this._txBaseStates.set(tx.id, this._currentStateId);
        this._openTransactions[this._currentStateId]++;
        return tx;
    }

    /**
     * @param {Transaction} tx
     * @returns {Promise.<boolean>}
     * @protected
     */
    async _apply(tx) {
        throw 'Unsupported operation';
    }
}
ObjectStore.MAX_STACK_SIZE = 10;
Class.register(ObjectStore);
