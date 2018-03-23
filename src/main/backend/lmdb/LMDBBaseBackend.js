/**
 * This is a wrapper around the interface for the LMDB.
 * It manages the access to a single table/object store.
 */
class LMDBBaseBackend {
    /**
     * Creates a wrapper given a JungleDB, the table's name, the database directory and an encoding.
     * @param {JungleDB} db The JungleDB object managing the connection.
     * @param {string} tableName The table name this object store represents.
     * @param {ICodec} [codec] A default codec for the object store.
     * @param {object} [options] Advanced options.
     */
    constructor(db, tableName, codec = null, options = {}) {
        this._db = db;

        this._tableName = tableName;

        this._codec = codec;
        this._keyEncoding = options && options.keyEncoding ? options.keyEncoding : null;
        this._dupSort = options && options.dupSort;
    }

    /** @type {boolean} */
    get connected() {
        return this._db.connected;
    }

    /** @type {string} The own table name. */
    get tableName() {
        return this._tableName;
    }

    /**
     * Truncates a dbi object store.
     * @param db A lmdb instance.
     * @param {string} tableName A table's name.
     * @return {boolean} Whether the table existed or not.
     */
    static truncate(db, tableName) {
        try {
            const dbi = db.openDbi({
                name: tableName
            });
            dbi.drop();
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Initialises the persisted indices of the object store.
     * @param {number} oldVersion
     * @param {number} newVersion
     */
    init(oldVersion, newVersion) {
        this._dbBackend = this._env.openDbi({
            name: this._tableName,
            create: true,
            dupSort: this._dupSort
        });
    }

    /**
     * Internal method called to decode a single value.
     * @param {*} value Value to be decoded.
     * @param {string} key Key corresponding to the value.
     * @returns {*} The decoded value, either by the object store's default or the overriding decoder if given.
     */
    decode(value, key) {
        if (value === null) { // LMDB returns null if value is not present.
            return undefined;
        }
        value = this._valueEncoding.decode(value);
        if (this._codec !== null && this._codec !== undefined) {
            value = this._codec.decode(value, key);
        }
        return value;
    }

    /**
     * Internal method called to encode a single value.
     * @param {*} value Value to be encoded.
     * @returns {*} The encoded value, either by the object store's default or the overriding decoder if given.
     */
    encode(value) {
        if (value === undefined) {
            return null; // LMDB only supports null values
        }
        if (this._codec !== null && this._codec !== undefined) {
            value = this._codec.encode(value);
        }
        value = this._valueEncoding.encode(value);
        return value;
    }

    /**
     * Internal method called to decode a single key.
     * @param {*} key Key to be decoded.
     * @returns {*} The decoded key, either by the object store's default or the overriding decoder if given.
     */
    decodeKey(key) {
        if (key === null || key === undefined) {
            return key;
        }
        if (this._keyEncoding !== null && this._keyEncoding !== undefined) {
            key = this._keyEncoding.decode(key);
        }
        return key;
    }

    /**
     * Internal method called to encode a single key.
     * @param {*} key Key to be encoded.
     * @returns {*} The encoded key, either by the object store's default or the overriding decoder if given.
     */
    encodeKey(key) {
        if (key === null || key === undefined) {
            return null; // LMDB only supports null values
        }
        if (this._keyEncoding !== null && this._keyEncoding !== undefined) {
            key = this._keyEncoding.encode(key);
        }
        return key;
    }

    /**
     * Empties the object store.
     * @returns {Promise} The promise resolves after emptying the object store.
     */
    truncate() {
        try {
            this._dbBackend.drop({
                justFreePages: true
            });
        } catch (e) {
            return Promise.reject(e);
        }
        return Promise.resolve();
    }

    /**
     * Fully deletes the object store and its indices.
     * @returns {Promise} The promise resolves after deleting the object store and its indices.
     */
    async destroy() {
        this._destroy();
    }

    get _valueEncoding() {
        return this._codec === null ? JungleDB.JSON_ENCODING :
            (this._codec.valueEncoding || this._codec.lmdbValueEncoding || JungleDB.JSON_ENCODING);
    }

    get _env() {
        return this._db.backend;
    }

    /**
     * Iterates over the keys and values in a given range and direction.
     * The callback is called for each value and primary key fulfilling the query
     * until it returns false and stops the iteration.
     * @param {function(value:*, key:string):boolean} callback A predicate called for each value and key until returning false.
     * @param {boolean} ascending Determines the direction of traversal.
     * @param {KeyRange} query An optional KeyRange to narrow down the iteration space.
     * @param {boolean} keysOnly
     * @protected
     */
    _readStream(callback, ascending = true, query = null, keysOnly = false) {
        const txn = this._env.beginTxn({ readOnly: true });
        const cursor = new lmdb.Cursor(txn, this._dbBackend, {
            keyIsBuffer: this._keyEncoding && this._keyEncoding.encoding === JungleDB.Encoding.BINARY
        });

        // Shortcut for exact match.
        if (!this._dupSort && query instanceof KeyRange && query.exactMatch) {
            const value = this.getSync(query.lower);
            if (value) {
                callback(value, query.lower);
            }
            cursor.close();
            txn.commit();
            return;
        }

        let currentKey = null;
        // Find lower bound and start from there.
        if (!(query instanceof KeyRange) || (ascending ? query.lower : query.upper) === undefined) {
            currentKey = this.decodeKey(ascending ? cursor.goToFirst() : cursor.goToLast());
        } else {
            // >= lower / >= upper
            currentKey = this.decodeKey(cursor.goToRange(this.encodeKey(ascending ? query.lower : query.upper)));

            // Did not find a key
            if (ascending && currentKey === null) {
                cursor.close();
                txn.commit();
                return;
            }

            // it might be that it is not included because of lower open
            if (!query.includes(currentKey)) {
                currentKey = this.decodeKey(ascending ? cursor.goToNext() : cursor.goToPrev());
            }

            // Did not find a key
            if (!ascending && currentKey === null) {
                cursor.close();
                txn.commit();
                return;
            }
        }

        while (!(query instanceof KeyRange) || query.includes(currentKey)) {
            let currentValue = null;
            if (currentKey === null) {
                break;
            }

            if (keysOnly) {
                currentValue = undefined;
            } else {
                this._cursorGetCurrent(cursor, (key, value) => {
                    currentKey = key;
                    currentValue = value;
                });
            }

            // Only consider return value if not undefined.
            const shouldContinue = callback(currentValue, currentKey);
            if (shouldContinue !== undefined && !shouldContinue) {
                break;
            }

            currentKey = this.decodeKey(ascending ? cursor.goToNext() : cursor.goToPrev());
        }

        cursor.close();
        txn.commit();
        return;
    }

    /**
     * @param txn
     * @param key
     * @returns {*}
     * @protected
     */
    _get(txn, key) {
        switch (this._valueEncoding.encoding) {
            case JungleDB.Encoding.STRING:
                return this.decode(txn.getString(this._dbBackend, this.encodeKey(key)), key);
            case JungleDB.Encoding.NUMBER:
                return this.decode(txn.getNumber(this._dbBackend, this.encodeKey(key)), key);
            case JungleDB.Encoding.BOOLEAN:
                return this.decode(txn.getBoolean(this._dbBackend, this.encodeKey(key)), key);
            case JungleDB.Encoding.BINARY:
                return this.decode(txn.getBinary(this._dbBackend, this.encodeKey(key)), key);
        }
        throw new Error('Invalid encoding given for LMDBBackend');
    }

    /**
     * @param txn
     * @param key
     * @param value
     * @param {boolean} [allowOverwrite]
     * @return {boolean}
     * @protected
     */
    _put(txn, key, value, allowOverwrite = true) {
        // Workaround for SIGABRT in node-lmdb
        if (!allowOverwrite && this._get(txn, key) === null) {
            return false;
        }

        value = this.encode(value);
        switch (this._valueEncoding.encoding) {
            case JungleDB.Encoding.STRING:
                txn.putString(this._dbBackend, this.encodeKey(key), value);
                return true;
            case JungleDB.Encoding.NUMBER:
                txn.putNumber(this._dbBackend, this.encodeKey(key), value);
                return true;
            case JungleDB.Encoding.BOOLEAN:
                txn.putBoolean(this._dbBackend, this.encodeKey(key), value);
                return true;
            case JungleDB.Encoding.BINARY:
                txn.putBinary(this._dbBackend, this.encodeKey(key), value);
                return true;
        }
        throw new Error('Invalid encoding given for LMDBBackend');
    }

    /**
     * @param txn
     * @param key
     * @param [value]
     * @protected
     */
    _remove(txn, key, value) {
        if (value !== undefined) {
            value = this.encode(value);
        }
        txn.del(this._dbBackend, this.encodeKey(key), value);
    }

    /**
     * @param cursor
     * @param callback
     * @returns {*}
     * @private
     */
    _cursorGetCurrent(cursor, callback) {
        const extendedCallback = (key, value) => {
            key = this.decodeKey(key);
            callback(key, this.decode(value, key));
        };
        switch (this._valueEncoding.encoding) {
            case JungleDB.Encoding.STRING:
                return cursor.getCurrentString(extendedCallback);
            case JungleDB.Encoding.NUMBER:
                return cursor.getCurrentNumber(extendedCallback);
            case JungleDB.Encoding.BOOLEAN:
                return cursor.getCurrentBoolean(extendedCallback);
            case JungleDB.Encoding.BINARY:
                return cursor.getCurrentBinary(extendedCallback);
        }
        throw new Error('Invalid encoding given for LMDBBackend');
    }

    /**
     * Empties the object store.
     * @param txn
     * @protected
     */
    _truncate(txn) {
        this._dbBackend.drop({
            justFreePages: true,
            txn: txn
        });
    }

    /**
     * Fully deletes the object store and its indices.
     * @protected
     */
    _destroy() {
        this._dbBackend.drop();
    }

    /**
     * Internal method to close the backend's connection.
     * @private
     */
    _close() {
        this._dbBackend.close();
    }
}
Class.register(LMDBBaseBackend);
