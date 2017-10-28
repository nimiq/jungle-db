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
            throw 'Can only inherit transactions';
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
            throw 'Can only apply transactions';
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
            if (this._modified.has(key)) {
                continue;
            }
            let oldValue = tx._originalValues.get(key);
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
            if (this._modified.has(key)) {
                continue;
            }
            // Removed values have to be remembered.
            this._put(key, tx._originalValues.get(key));
        }
    }

    /**
     * Unsupported operation for snapshots.
     * @override
     */
    async truncate() {
        throw 'Unsupported operation on snapshots';
    }

    /**
     * Unsupported operation for snapshots.
     * @override
     * @throws
     */
    async commit(tx) {
        throw 'Cannot commit snapshots';
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
    async _commit(tx) {
        throw 'Cannot commit snapshots';
    }

    /**
     * Aborts a snapshot and stops updating its diff.
     * @override
     * @param [tx]
     * @returns {Promise.<boolean>} A promise of the success outcome.
     */
    async abort(tx) {
        if (this._state !== Transaction.STATE.OPEN) {
            throw 'Snapshot already closed';
        }
        const result = await this._commitBackend.abort(this);
        if (!result) {
            return false;
        }

        this._state = Transaction.STATE.ABORTED;

        // Cleanup.
        this._truncated = true;
        this._modified.clear();
        this._removed.clear();
        this._originalValues.clear();

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
        throw 'Unsupported operation on snapshots';
    }

    /**
     * Unsupported operation for snapshots.
     * @override
     * @returns {Promise}
     */
    async remove(key) {
        throw 'Unsupported operation on snapshots';
    }

    /**
     * Unsupported operation for snapshots.
     * @override
     */
    createIndex() {
        throw 'Unsupported operation on snapshots';
    }

    /**
     * Unsupported operation for snapshots.
     * @override
     */
    async deleteIndex() {
        throw 'Unsupported operation on snapshots';
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
        throw 'Unsupported operation on snapshots';
    }

    /**
     * Unsupported operation for snapshots.
     * @override
     */
    snapshot() {
        throw 'Unsupported operation on snapshots';
    }
}
Class.register(Snapshot);
