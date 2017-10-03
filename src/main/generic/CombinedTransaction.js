/**
 * This class represents a combined transaction across object stores.
 * @implements {ICommittable}
 */
class CombinedTransaction {
    /**
     * @param {...Transaction} transactions The transactions to build the combined transaction from.
     */
    constructor(...transactions) {
        if (!CombinedTransaction.isConsistent(transactions)) {
            throw 'Given set of transactions violates rules for combined transactions';
        }
        this._transactions = transactions;
        this._dependency = this; // Update members.
        /** @type {Map.<Transaction,function()>} */
        this._flushable = new Map();
    }

    /** @type {Array.<Transaction>} */
    get transactions() {
        return this._transactions;
    }

    /**
     * Merges two combined transactions.
     * @param {CombinedTransaction} ctx The combined transaction to merge.
     * @param {Transaction} tx The transaction that is now applied to one of our own transactions.
     */
    merge(ctx, tx) {
        if (ctx === null) {
            return;
        }
        // Use all transactions from ctx except tx.
        // Then update dependencies in ctx Transactions to this.
        let ctxTransactions = new Set(ctx._transactions);
        let ownTransactions = new Set(this._transactions);
        ownTransactions = ownTransactions.union(ctxTransactions);
        ownTransactions.delete(tx);
        ctxTransactions.delete(tx);
        this._transactions = Array.from(ownTransactions);
        ctx._transactions = Array.from(ctxTransactions);

        for (const [key, value] of ctx._flushable) {
            this._flushable.set(key, value);
        }
        this._flushable.delete(tx);
        ctx._dependency = this;
    }

    /**
     * Verifies the two most important consistency rules for combined transactions:
     * 1. only transactions from different object stores
     * 2. only open transactions
     * 3. only transactions from the same JungleDB instance
     * @param {...Transaction} transactions
     * @returns {boolean} Whether the given set of transactions is suitable for a combined transaction.
     */
    static isConsistent(...transactions) {
        const objectStores = new Set();
        let jdb = null;
        for (const tx of transactions) {
            // Rule 2 is violated:
            if (tx.state !== Transaction.STATE.OPEN) {
                return false;
            }
            // Rule 1 is violated:
            if (objectStores.has(tx._objectStore)) {
                return false;
            }
            // Rule 3 is violated:
            if (jdb === null) {
                jdb = tx._objectStore.jungleDB;
            } else if (jdb !== tx._objectStore.jungleDB) {
                return false;
            }
            objectStores.add(tx._objectStore);
        }
        return true;
    }

    /**
     * To be called when a transaction is flushable to the persistent state.
     * Triggers combined flush as soon as all transactions are ready.
     * @param {Transaction} tx Transaction to be reported flushable.
     * @param {function()} callback A callback to be called after the transaction is flushed.
     * @returns {boolean} Whether the flushing has been triggered.
     */
    onFlushable(tx, callback=null) {
        // Save as flushable and prepare and flush only if all are flushable.
        // Afterwards call the callbacks to cleanup the ObjectStores' transaction stacks.
        this._flushable.set(tx, callback);

        // All are flushable, so go ahead.
        if (this._transactions.every(tx => this._flushable.has(tx))) {
            JungleDB.commitCombined(this).then(() => {
                for (const value of ctx._flushable.values()) {
                    value();
                }
            });
            return true;
        }
        return false;
    }

    /**
     * Is used to commit the state of an open transaction.
     * A user only needs to call this method on Transactions without arguments.
     * The optional tx argument is only used internally, in order to commit a transaction to the underlying store.
     * If the commit was successful, the method returns true, and false otherwise.
     * @returns {Promise.<boolean>} A promise of the success outcome.
     */
    async commit() {
        if (this._isCommittable()) {
            await this._commit();
            return true;
        }
        await this.abort();
        return false;
    }

    /**
     * Is used to abort an open transaction.
     * A user only needs to call this method on Transactions without arguments.
     * The optional tx argument is only used internally, in order to abort a transaction on the underlying store.
     * @returns {Promise} The promise resolves after successful abortion of the transaction.
     */
    async abort() {
        return Promise.all(this._transactions.map(tx => tx.abort()));
    }

    /**
     * Creates a new transaction, ensuring read isolation
     * on the most recently successfully committed state.
     * @returns {Transaction} The transaction object.
     */
    transaction() {
        throw 'Unsupported operation';
    }

    /**
     * Is used to probe whether a transaction can be committed.
     * This, for example, includes a check whether another transaction has already been committed.
     * @protected
     * @returns {boolean} Whether a commit will be successful.
     */
    _isCommittable() {
        return this._transactions.every(tx => tx._isCommittable());
    }

    /**
     * Is used to commit the transaction.
     * @protected
     * @returns {Promise} A promise that resolves upon successful application of the transaction.
     */
    async _commit() {
        return Promise.all(this._transactions.map(tx => tx._commit()));
    }

    /**
     * Allows to change the backend of a Transaction when the state has been flushed.
     * @param backend
     * @protected
     */
    set _backend(backend) {
        throw 'Unsupported operation';
    }

    /**
     * Sets a new CombinedTransaction as dependency.
     * @param {CombinedTransaction} dependency
     * @protected
     */
    set _dependency(dependency) {
        for (const tx of this._transactions) {
            tx._dependency = dependency;
        }
    }

    /**
     * @type {CombinedTransaction} If existent, a combined transaction encompassing this object.
     */
    get dependency() {
        return this;
    }

    /**
     * Returns the object store this transaction belongs to.
     * @type {ObjectStore}
     */
    get objectStore() {
        throw 'Unsupported operation';
    }
}
Class.register(CombinedTransaction);
