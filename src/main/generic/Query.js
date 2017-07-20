class Query {
    /**
     * @param {number} op
     * @param {*} value
     * @param {*} [value2]
     * @private
     */
    static _parseKeyRange(op, value, value2) {
        switch (op) {
            case Query.OPERATORS.GT:
                return KeyRange.lowerBound(value, true);
            case Query.OPERATORS.GE:
                return KeyRange.lowerBound(value, false);
            case Query.OPERATORS.LT:
                return KeyRange.upperBound(value, true);
            case Query.OPERATORS.LE:
                return KeyRange.upperBound(value, false);
            case Query.OPERATORS.EQ:
                return KeyRange.only(value);
            case Query.OPERATORS.BETWEEN:
                return KeyRange.bound(value, value2, true, true);
            case Query.OPERATORS.WITHIN:
                return KeyRange.bound(value, value2, false, false);
        }
        throw 'Unknown operator';
    }

    /**
     * @param {...Query} arguments
     * @returns {Query}
     */
    static and() {
        const args = Array.from(arguments);
        return new Query(args, Query.OPERATORS.AND);
    }

    /**
     * @param {...Query} arguments
     * @returns {Query}
     */
    static or() {
        const args = Array.from(arguments);
        return new Query(args, Query.OPERATORS.OR);
    }

    /**
     * @param {string} indexName
     * @returns {Query}
     */
    static max(indexName) {
        return new Query(indexName, Query.OPERATORS.MAX);
    }

    /**
     * @param {string} indexName
     * @returns {Query}
     */
    static min(indexName) {
        return new Query(indexName, Query.OPERATORS.MIN);
    }

    /**
     * @param {string} indexName
     * @param {*) val
     * @returns {Query}
     */
    static lt(indexName, val) {
        return new Query(indexName, Query.OPERATORS.LT, val);
    }

    /**
     * @param {string} indexName
     * @param {*) val
     * @returns {Query}
     */
    static le(indexName, val) {
        return new Query(indexName, Query.OPERATORS.LE, val);
    }

    /**
     * @param {string} indexName
     * @param {*) val
     * @returns {Query}
     */
    static gt(indexName, val) {
        return new Query(indexName, Query.OPERATORS.GT, val);
    }

    /**
     * @param {string} indexName
     * @param {*) val
     * @returns {Query}
     */
    static ge(indexName, val) {
        return new Query(indexName, Query.OPERATORS.GE, val);
    }

    /**
     * @param {string} indexName
     * @param {*) val
     * @returns {Query}
     */
    static eq(indexName, val) {
        return new Query(indexName, Query.OPERATORS.EQ, val);
    }

    /**
     * Excluding boundaries.
     * @param {string} indexName
     * @param {*) lower
     * @param {*} upper
     * @returns {Query}
     */
    static between(indexName, lower, upper) {
        return new Query(indexName, Query.OPERATORS.BETWEEN, lower, upper);
    }

    /**
     * Including boundaries.
     * @param {string} indexName
     * @param {*) lower
     * @param {*} upper
     * @returns {Query}
     */
    static within(indexName, lower, upper) {
        return new Query(indexName, Query.OPERATORS.WITHIN, lower, upper);
    }

    /**
     * @param {string|Array.<Query>} arg
     * @param {number} op
     * @param {*} [value]
     * @param {*} [value2]
     * @private
     */
    constructor(arg, op, value, value2) {
        // If first argument is an array of queries, this is a combined query.
        if (Array.isArray(arg)) {
            if (arg.some(it => !(it instanceof Query))) {
                throw 'Invalid query';
            }
            if (Query.COMBINED_OPERATORS.indexOf(op) < 0) {
                throw 'Unknown operator';
            }
            this._queryType = Query.Type.COMBINED;
            this._queries = arg;
            this._op = op;
        }
        // Otherwise we have a single query.
        else {
            if (Query.RANGE_OPERATORS.indexOf(op) >= 0) {
                this._queryType = Query.Type.RANGE;
                this._keyRange = Query._parseKeyRange(op, value, value2);
            } else if (Query.ADVANCED_OPERATORS.indexOf(op) >= 0) {
                this._queryType = Query.Type.ADVANCED;
                this._op = op;
            } else {
                throw 'Unknown operator';
            }
            this._indexName = arg;
        }
    }

    /**
     * @param {ObjectStore} objectStore
     * @returns {Promise.<Array.<*>>}
     */
    async getAll(objectStore) {
        const keys = await this._execute(objectStore);
        const results = [];
        for (const key of keys) {
            results.push(await objectStore.get(key));
        }
        return results;
    }

    /**
     * @param {ObjectStore} objectStore
     * @returns {Promise.<Array.<string>>}
     */
    async getAllKeys(objectStore) {
        return [...await this._execute(objectStore)];
    }

    /**
     * @param {ObjectStore} objectStore
     * @returns {Promise.<Set>}
     * @private
     */
    async _execute(objectStore) {
        switch (this._queryType) {
            case Query.Type.COMBINED:
                return Promise.resolve(this._executeCombined(objectStore));

            case Query.Type.ADVANCED:
                return Promise.resolve(this._executeAdvanced(objectStore));

            case Query.Type.RANGE:
                return this._executeRange(objectStore);
        }
        return Promise.resolve(new Set());
    }

    /**
     * @param {ObjectStore} objectStore
     * @returns {Set}
     * @private
     */
    async _executeCombined(objectStore) {
        // Evaluate children.
        const results = [];
        for (const query of this._queries) {
            results.push(await query._execute(objectStore));
        }

        if (this._op === Query.OPERATORS.AND) {
            // Provide shortcuts.
            if (results.length === 0) {
                return new Set();
            } else if (results.length === 1) {
                return results[0];
            }

            // Set intersection of all keys.
            const firstResult = results.shift();
            const intersection = new Set();
            for (const val of firstResult) {
                if (results.every(result => result.has(val))) {
                    intersection.add(val);
                }
            }
            return intersection;
        } else if (this._op === Query.OPERATORS.OR) {
            // Set union of all keys.
            const union = new Set();
            for (const result of results) {
                result.forEach(val => union.add(val));
            }
            return union;
        }
        return new Set();
    }

    /**
     * @param {ObjectStore} objectStore
     * @returns {Set}
     * @private
     */
    async _executeAdvanced(objectStore) {
        const index = objectStore.index(this._indexName);
        let results = [];
        switch (this._op) {
            case Query.OPERATORS.MAX:
                results.push(await index.getMaxKey());
                break;
            case Query.OPERATORS.MIN:
                results.push(await index.getMinKey());
                break;
        }
        return new Set(results);
    }

    /**
     * @param {ObjectStore} objectStore
     * @returns {Promise.<Set>}
     * @private
     */
    async _executeRange(objectStore) {
        const index = objectStore.index(this._indexName);
        return new Set(await index.getAllKeys(this._keyRange));
    }
}
Query.OPERATORS = {
    GT: 0,
    GE: 1,
    LT: 2,
    LE: 3,
    EQ: 4,
    // NEQ: 5, not supported
    BETWEEN: 7,
    WITHIN: 8,
    MAX: 9,
    MIN: 10,
    AND: 11,
    OR: 12
};
Query.RANGE_OPERATORS = [
    Query.OPERATORS.GT,
    Query.OPERATORS.GE,
    Query.OPERATORS.LT,
    Query.OPERATORS.LE,
    Query.OPERATORS.EQ,
    Query.OPERATORS.BETWEEN,
    Query.OPERATORS.WITHIN
];
Query.ADVANCED_OPERATORS = [Query.OPERATORS.MAX, Query.OPERATORS.MIN];
Query.COMBINED_OPERATORS = [Query.OPERATORS.AND, Query.OPERATORS.OR];
Query.Type = {
    RANGE: 0,
    ADVANCED: 1,
    COMBINED: 2
};
Class.register(Query);

