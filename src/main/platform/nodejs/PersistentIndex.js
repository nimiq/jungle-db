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
     * @param {JungleDB} db The underlying JungleDB.
     * @param {string} indexName The index name.
     * @param {string|Array.<string>} [keyPath] The key path of the indexed attribute.
     * If the keyPath is not given, this is a primary index.
     * @param {boolean} [multiEntry] Whether the indexed attribute is considered to be iterable or not.
     * @param {boolean} [unique] Whether there is a unique constraint on the attribute.
     */
    constructor(objectStore, db, indexName, keyPath, multiEntry=false, unique=false) {
        super(objectStore, keyPath, multiEntry, unique);

        this._prefix = `_${objectStore.tableName}-${indexName}`;
        this._dbBackend = new LevelDBBackend(db, this._prefix, IndexCodec.instance);

        this._indexName = indexName;
    }

    /** The levelDB backend. */
    get backend() {
        return this._dbBackend;
    }

    /**
     * Reinitialises the index.
     * @returns {Promise} The promise resolves after emptying the index.
     */
    truncate() {
        return Promise.all([super.truncate(), this._dbBackend.truncate()]);
    }

    /**
     * Reinitialises the index in memory and
     * returns batch operations to reinitialise the index.
     * @returns {Promise.<Array>} The promise contains the batch operations.
     */
    async _truncate() {
        await InMemoryIndex.prototype.truncate.call(this);
        return LevelDBBackend._truncate(this._dbBackend._dbBackend);
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
        await this._dbBackend.init();
        const root = await this._get('_root');

        // Check whether the stored index is consistent with the main database.
        if (typeof root === 'number') {
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
        }

        return this;
    }

    /**
     * Internally applies a transaction to the store's state.
     * This needs to be done in batch (as a db level transaction), i.e., either the full state is updated
     * or no changes are applied.
     * @param {Transaction} tx The transaction to apply.
     * @returns {Promise.<TreeTransaction>} The promise resolves after applying the transaction.
     * @protected
     */
    async _apply(tx) {
        // TODO do this efficient
        if (tx._truncated) {
            await this.truncate();
        }
        let treeTx = null;

        for (const key of tx._removed) {
            const oldValue = tx._originalValues.get(key);
            treeTx = InMemoryIndex.prototype.remove.call(this, key, oldValue).merge(treeTx);
        }
        for (const [key, value] of tx._modified) {
            const oldValue = tx._originalValues.get(key);
            treeTx = InMemoryIndex.prototype.put.call(this, key, value, oldValue).merge(treeTx);
        }

        return treeTx;
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
