/**
 * This interface represents an object store (roughly corresponding to a table in a relational database).
 * It stores key-value pairs where the key is generally considered to be a string and the value is any object.
 * The key is the entry's primary key. Other keys within the object may be accessed by indices as offered by the store.
 * @interface
 */
class ICommittable {
    /**
     * Is used to commit the state of an open transaction.
     * A user only needs to call this method on Transactions without arguments.
     * The optional tx argument is only used internally, in order to commit a transaction to the underlying store.
     * If the commit was successful, the method returns true, and false otherwise.
     * @abstract
     * @param {Transaction} [tx] The transaction to be applied, only used internally.
     * @returns {Promise.<boolean>} A promise of the success outcome.
     */
    async commit(tx) {} // eslint-disable-line no-unused-vars

    /**
     * Is used to abort an open transaction.
     * A user only needs to call this method on Transactions without arguments.
     * The optional tx argument is only used internally, in order to abort a transaction on the underlying store.
     * @abstract
     * @param {Transaction} [tx] The transaction to be aborted, only used internally.
     * @returns {Promise} The promise resolves after successful abortion of the transaction.
     */
    async abort(tx) {} // eslint-disable-line no-unused-vars

    /**
     * Creates a new transaction, ensuring read isolation
     * on the most recently successfully committed state.
     * @abstract
     * @returns {Transaction} The transaction object.
     */
    transaction() {} // eslint-disable-line no-unused-vars

    /**
     * Creates an in-memory snapshot of the current state.
     * This snapshot only maintains the differences between the state at the time of the snapshot
     * and the current state.
     * To stop maintaining the snapshot, it has to be aborted.
     * @abstract
     * @returns {Snapshot}
     */
    snapshot() {} // eslint-disable-line no-unused-vars

    /**
     * Is used to probe whether a transaction can be committed.
     * This, for example, includes a check whether another transaction has already been committed.
     * @abstract
     * @protected
     * @param {Transaction} [tx] The transaction to be applied, if not given checks for the this transaction.
     * @returns {boolean} Whether a commit will be successful.
     */
    _isCommittable(tx) {} // eslint-disable-line no-unused-vars

    /**
     * Is used to commit the transaction.
     * @abstract
     * @protected
     * @param {Transaction} tx The transaction to be applied.
     * @returns {Promise} A promise that resolves upon successful application of the transaction.
     */
    async _commit(tx) {} // eslint-disable-line no-unused-vars

    /**
     * Allows to change the backend of a Transaction when the state has been flushed.
     * @abstract
     * @param backend
     * @protected
     */
    set _backend(backend) {} // eslint-disable-line no-unused-vars

    /**
     * Sets a new CombinedTransaction as dependency.
     * @param {CombinedTransaction} dependency
     * @protected
     */
    set _dependency(dependency) {} // eslint-disable-line no-unused-vars

    /**
     * @type {CombinedTransaction} If existent, a combined transaction encompassing this object.
     */
    get dependency() {} // eslint-disable-line no-unused-vars

    /**
     * Returns the object store this transaction belongs to.
     * @tyoe {ObjectStore}
     */
    get objectStore() {} // eslint-disable-line no-unused-vars
}
