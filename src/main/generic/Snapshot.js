/**
 * Snapshots present a read-only version of a specific state.
 * As long as a snapshot is not aborted, the object store will reflect changes to the state
 * in form of the differences to the originating state in the snapshot.
 * This makes efficient queries against a fixed state possible without blocking other transactions
 * to commit.
 * @extends {Transaction}
 */
class Snapshot extends Transaction {
    /**
     * This constructor should only be called by an ObjectStore object.
     * @param {ObjectStore} objectStore The object store this transaction belongs to.
     * @param {IObjectStore} backend The backend this transaction is based on.
     * @protected
     */
    constructor(objectStore, backend) {
        super(objectStore, backend, objectStore, false);
    }

    /**
     * A specific set of changes can be assumed to be already applied by providing a Transaction or Snapshot.
     * These differences will be inherited while the backend of the snapshot remains the current state.
     * This is useful, if we have a transaction/snapshot to a previous state, which we do not want to commit.
     * Then, we can still base our snapshot on this earlier state although the current backend is already ahead.
     * @param {Transaction} tx A transaction or snapshot containing changes that have already been applied.
     * @protected
     */
    inherit(tx) {
        if (!(tx instanceof Transaction)) {
            throw new Error('Can only inherit transactions');
        }

        return super._applySync(tx);
    }

    /**
     * Internally applies a transaction to the snapshot state.
     * In contrast to transactions, this tries to reflect the old state in the snapshot.
     * @param {Transaction} tx The transaction to apply.
     * @returns {Promise} The promise resolves after applying the transaction.
     * @protected
     */
    async _apply(tx) {
        if (!(tx instanceof Transaction)) {
            throw new Error('Can only apply transactions');
        }
        if (tx._truncated) {
            // Need to copy complete old state.
            await this.valueStream((value, key) => {
                if (!this._modified.has(key)) {
                    this._put(key, value);
                }
                return true;
            });
        }
        for (const [key, value] of tx._modified) {
            // Continue if we already have the old value for this key.
            if (this._modified.has(key) || this._removed.has(key)) {
                continue;
            }
            const oldValue = await this.get(key);
            // If this key is newly introduced,
            // we have to mark it as removed to maintain our state.
            if (!oldValue) {
                this._remove(key, value);
            } else {
                // Otherwise store oldValue.
                this._put(key, oldValue, value);
            }
        }
        for (const key of tx._removed) {
            // Continue if we already have the old value for this key.
            if (this._modified.has(key) || this._removed.has(key)) {
                continue;
            }
            // Removed values have to be remembered.
            const oldValue = await this.get(key);
            this._put(key, oldValue);
        }
    }

    /**
     * Unsupported operation for snapshots.
     * @returns {Promise}
     * @override
     */
    async truncate() {
        throw new Error('Unsupported operation on snapshots: truncate');
    }

    /**
     * Unsupported operation for snapshots.
     * @override
     */
    truncateSync() {
        throw new Error('Unsupported operation on snapshots: truncateSync');
    }

    /**
     * Unsupported operation for snapshots.
     * @override
     * @throws
     */
    async commit(tx) {
        throw new Error('Cannot commit snapshots: commit');
    }

    /**
     * Unsupported operation for snapshots.
     * @override
     * @protected
     * @param {Transaction} [tx] The transaction to be applied, if not given checks for the this transaction.
     * @returns {boolean} Whether a commit will be successful.
     */
    _isCommittable(tx) {
        return false;
    }

    /**
     * Unsupported operation for snapshots.
     * @override
     * @protected
     * @param {Transaction} tx The transaction to be applied.
     * @returns {Promise} A promise that resolves upon successful application of the transaction.
     */
    async _commitInternal(tx) {
        throw new Error('Cannot commit snapshots');
    }

    /**
     * Commits the transaction to the backend.
     * @override
     * @returns {Promise.<boolean>} A promise of the success outcome.
     * @protected
     */
    async _commitBackend() {
        throw new Error('Cannot commit snapshots');
    }

    /**
     * Aborts a snapshot and stops updating its diff.
     * @override
     * @param [tx]
     * @returns {Promise.<boolean>} A promise of the success outcome.
     */
    abort(tx) {
        return this._abortBackend();
    }

    /**
     * Aborts a transaction on the backend.
     * @returns {Promise.<boolean>} A promise of the success outcome.
     * @override
     */
    async _abortBackend() {
        if (this._state !== Transaction.STATE.OPEN) {
            throw new Error('Snapshot already closed');
        }
        const result = await this._managingBackend.abort(this);
        if (!result) {
            return false;
        }

        this._state = Transaction.STATE.ABORTED;

        // Cleanup.
        this._truncated = true;
        this._modified.clear();
        this._removed.clear();

        // Update indices.
        for (const index of this._indices.values()) {
            index.truncate();
        }

        return true;
    }

    /**
     * Unsupported operation for snapshots.
     * @override
     * @returns {Promise}
     */
    async put(key, value) {
        throw new Error('Unsupported operation on snapshots: put');
    }

    /**
     * Unsupported operation for snapshots.
     * @override
     */
    putSync(key, value) {
        throw new Error('Unsupported operation on snapshots: putSync');
    }

    /**
     * Unsupported operation for snapshots.
     * @override
     * @returns {Promise}
     */
    async remove(key) {
        throw new Error('Unsupported operation on snapshots: remove');
    }

    /**
     * Unsupported operation for snapshots.
     * @override
     */
    removeSync(key) {
        throw new Error('Unsupported operation on snapshots: removeSync');
    }

    /**
     * Alias for abort.
     * @returns {Promise} The promise resolves after successful abortion of the transaction.
     */
    close() {
        return this.abort();
    }

    /**
     * Unsupported operation for snapshots.
     * @override
     */
    transaction() {
        throw new Error('Unsupported operation on snapshots: transaction');
    }

    /**
     * Unsupported operation for snapshots.
     * @override
     */
    synchronousTransaction() {
        throw new Error('Unsupported operation on snapshots: synchronousTransaction');
    }

    /**
     * Unsupported operation for snapshots.
     * @override
     */
    snapshot() {
        throw new Error('Unsupported operation on snapshots: snapshot');
    }
}
Class.register(Snapshot);
