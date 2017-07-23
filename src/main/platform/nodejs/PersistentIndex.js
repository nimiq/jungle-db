/**
 * @implements IIndex
 */
class PersistentIndex extends InMemoryIndex {
    /**
     * @param {LevelDBBackend} objectStore
     * @param {string} indexName
     * @param {string|Array.<string>} [keyPath]
     * @param {boolean} [multiEntry]
     * @param {boolean} [unique]
     */
    constructor(objectStore, indexName, keyPath, multiEntry=false, unique=false) {
        super(objectStore, keyPath, multiEntry, unique);

        this._databaseDirectory = `${objectStore.databaseDirectory}/${indexName}`;
        this._dbBackend = new LevelDBBackend(undefined, indexName, `${objectStore.databaseDirectory}/`, objectStore.valueEncoding);

        this._indexName = indexName;

        this._persistanceSynchronizer = new Synchronizer();
        this._version = 0;

        return this._init();
    }

    /**
     * @returns {Promise}
     */
    truncate() {
        this._version = 0;
        return Promise.all([super.truncate(), this._dbBackend.truncate()]);
    }

    /**
     * @param {string} key
     * @returns {Promise.<*>}
     */
    _get(key) {
        return this._dbBackend.get(key);
    }

    /**
     * @returns {Promise.<Map.<number,Object>>}
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

    async _init() {
        this._version = (await this._get('_version')) || this._version;
        const root = await this._get('_root');

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
                this.put(key, undefined, value);
            });
            await this._dbBackend.put('_version', this._objectStore.indexVersion);
        }

        return this;
    }

    /**
     * @param {string} key
     * @param {*} oldObj
     * @param {*} newObj
     */
    put(key, oldObj, newObj) {
        const treeTx = super.put(key, oldObj, newObj);
        this._version = (this._version + 1) % LevelDBBackend.MAX_INDEX_VERSION;
        return this._persist(treeTx, this._version);
    }

    /**
     * @param {string} key
     * @param {*} obj
     */
    remove(key, obj) {
        const treeTx = super.remove(key, obj);
        this._version = (this._version + 1) % LevelDBBackend.MAX_INDEX_VERSION;
        return this._persist(treeTx, this._version);
    }

    /**
     * @param {TreeTransaction} treeTx
     * @param {number} version
     * @returns {Promise}
     * @private
     */
    _persist(treeTx, version) {
        this._persistanceSynchronizer.push(() => {
            return this._write(treeTx, version);
        });
    }

    /**
     * @param {TreeTransaction} treeTx
     * @returns {Promise}
     * @param {number} version
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
    }

    /**
     * @param {boolean} truncated
     * @param {Map.<string,Array.<*>>} modified
     * @param {Map.<string,*>} removed
     * @returns {Promise.<boolean>}
     * @protected
     */
    async _apply(truncated, modified, removed) {
        // TODO do this efficient
        if (truncated) {
            await this.truncate();
        }
        return new Promise((resolve, error) => {
            this._version = (this._version + 1) % LevelDBBackend.MAX_INDEX_VERSION;
            let treeTx = null;

            for (const [key, oldObj] of removed) {
                treeTx = super.remove(key, oldObj).merge(treeTx);
            }
            for (const [key, [oldObj, newObj]] of modified) {
                treeTx = super.put(key, oldObj, newObj).merge(treeTx);
            }

            return this._persist(treeTx, this._version);
        });
    }

    /**
     * @type {string}
     */
    get name() {
        return this._indexName;
    }
}
Class.register(PersistentIndex);
