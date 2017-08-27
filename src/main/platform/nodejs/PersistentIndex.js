/**
 * This class implements a persistent index for LevelDB.
 * It bases on the InMemoryIndex class and its BTree implementation.
 * The BTree is stored in its own LevelDB database.
 * A version number is used to ensure that the index and its object store are
 * based on the same state. On mismatch, the index is recalculated.
 */
class PersistentIndex extends InMemoryIndex {
    /**
     * Creates a new PersistentIndex for a LevelDB backend.
     * @param {LevelDBBackend} objectStore The underlying LevelDB backend.
     * @param {string} indexName The index name.
     * @param {string|Array.<string>} [keyPath] The key path of the indexed attribute.
     * If the keyPath is not given, this is a primary index.
     * @param {boolean} [multiEntry] Whether the indexed attribute is considered to be iterable or not.
     * @param {boolean} [unique] Whether there is a unique constraint on the attribute.
     */
    constructor(objectStore, indexName, keyPath, multiEntry=false, unique=false) {
        super(objectStore, keyPath, multiEntry, unique);

        this._databaseDirectory = `${objectStore.databaseDirectory}/${indexName}`;
        this._dbBackend = new LevelDBBackend(undefined, indexName, `${objectStore.databaseDirectory}/`, objectStore.valueEncoding);

        this._indexName = indexName;

        this._persistanceSynchronizer = new Synchronizer();
        this._version = 0;
    }

    /**
     * Reinitialises the index.
     * @returns {Promise} The promise resolves after emptying the index.
     */
    truncate() {
        this._version = 0;
        return Promise.all([super.truncate(), this._dbBackend.truncate()]);
    }

    /**
     * Closes the connection to the index database.
     * @returns {Promise} The promise resolves after closing the object store.
     */
    close() {
        return this._dbBackend.close();
    }

    /**
     * Fully deletes the database of the index.
     * @returns {Promise} The promise resolves after deleting the database.
     */
    destroy() {
        return this._dbBackend.destroy();
    }

    /**
     * Internal method to get a value from the index backend.
     * @param {string} key The key to retrieve.
     * @returns {Promise.<*>} A promise for the corresponding value.
     * @private
     */
    _get(key) {
        return this._dbBackend.get(key);
    }

    /**
     * Internal method to load the BTree node map from the database.
     * @returns {Promise.<Map.<number,Object>>} The map of BTree nodes as JSON objects.
     * @private
     */
    async _load() {
        const result = new Map();
        await this._dbBackend.map((key, value) => {
            const strKey = ''+key;
            if (!strKey.startsWith('_')) {
                result.set(parseInt(key), value);
            }
        });
        return result;
    }

    /**
     * Initialises the persistent index by validating the version numbers
     * and loading the InMemoryIndex from the database.
     * @returns {Promise.<PersistentIndex>} A promise of the fully initialised index.
     */
    async init() {
        const [version, root] = await Promise.all([this._get('_version'), this._get('_root')]);
        this._version = version || this._version;

        // Check whether the stored index is consistent with the main database.
        if (this._version === this._objectStore.indexVersion && (typeof root === 'number')) {
            const nodes = await this._load();
            this._tree = BTree.loadFromJSON(root, nodes);
        } else {
            // Clear database.
            await this.truncate();

            // Build index for whole database.
            // TODO Make this operation more efficient.
            await this._objectStore.map((key, value) => {
                this.put(key, value, undefined);
            });
            await this._dbBackend.put('_version', this._objectStore.indexVersion);
        }

        return this;
    }

    /**
     * Inserts a new key-value pair into the index.
     * For replacing an existing pair, the old value has to be passed as well.
     * @param {string} key The primary key of the pair.
     * @param {*} value The value of the pair. The indexed key will be extracted from this.
     * @param {*} [oldValue] The old value associated with the primary key.
     * @returns {Promise.<TreeTransaction>} A promise resolving upon successful completion.
     */
    put(key, value, oldValue) {
        const treeTx = super.put(key, value, oldValue);
        this._version = (this._version + 1) % LevelDBBackend.MAX_INDEX_VERSION;
        return this._persist(treeTx, this._version);
    }

    /**
     * Removes a key-value pair from the index.
     * @param {string} key The primary key of the pair.
     * @param {*} obj The old value of the pair. The indexed key will be extracted from this.
     * @returns {Promise.<TreeTransaction>} A promise resolving upon successful completion.
     */
    remove(key, obj) {
        const treeTx = super.remove(key, obj);
        this._version = (this._version + 1) % LevelDBBackend.MAX_INDEX_VERSION;
        return this._persist(treeTx, this._version);
    }

    /**
     * Internal method to synchronously persist changes in the index.
     * @param {TreeTransaction} treeTx The tree transaction to persist.
     * @param {number} version The new version number of this index.
     * @returns {Promise} A promise resolving upon successful completion.
     * @private
     */
    _persist(treeTx, version) {
        this._persistanceSynchronizer.push(() => {
            return this._write(treeTx, version);
        });
    }

    /**
     * Internal method updating the database in batch.
     * @param {TreeTransaction} treeTx The tree transaction to persist.
     * @param {number} version The new version number of this index.
     * @returns {Promise} A promise resolving upon successful completion.
     * @private
     */
    async _write(treeTx, version) {
        // Save to underlying database.
        // Make use of transactions.
        const tx = new IndexTransaction();
        tx.put('_root', treeTx.root.id);
        for (const node of treeTx.removed) {
            tx.remove(node.id);
        }
        for (const node of treeTx.modified) {
            tx.put(node.id, node.toJSON());
        }
        tx.put('_version', version);
        await this._dbBackend._apply(tx);
        return treeTx;
    }

    /**
     * Internally applies a transaction to the store's state.
     * This needs to be done in batch (as a db level transaction), i.e., either the full state is updated
     * or no changes are applied.
     * @param {Transaction} tx The transaction to apply.
     * @returns {Promise} The promise resolves after applying the transaction.
     * @protected
     */
    async _apply(tx) {
        // TODO do this efficient
        if (tx._truncated) {
            await this.truncate();
        }
        this._version = (this._version + 1) % LevelDBBackend.MAX_INDEX_VERSION;
        let treeTx = null;

        for (const key of tx._removed) {
            const oldValue = tx._originalValues.get(key);
            treeTx = super.remove(key, oldValue).merge(treeTx);
        }
        for (const [key, value] of tx._modified) {
            const oldValue = tx._originalValues.get(key);
            treeTx = super.put(key, value, oldValue).merge(treeTx);
        }

        await this._persist(treeTx, this._version);
        return true;
    }

    /**
     * The name of the index.
     * @type {string}
     */
    get name() {
        return this._indexName;
    }
}
Class.register(PersistentIndex);
