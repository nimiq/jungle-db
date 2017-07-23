class IndexTransaction {
    constructor() {
        this._modified = new Map();
        this._removed = new Set();
        this._truncated = false;
    }

    async truncate() {
        this._truncated = true;
        this._modified.clear();
        this._removed.clear();
    }

    /**
     * @param {string} key
     * @param {*} value
     */
    put(key, value) {
        this._removed.delete(key);
        this._modified.set(key, value);

    }

    /**
     * @param {string} key
     */
    remove(key) {
        this._removed.add(key);
        this._modified.delete(key);
    }

}
Class.register(IndexTransaction);
