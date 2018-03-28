/**
 * This class represents a Query object.
 * Queries are constructed using the static helper methods.
 */
class Query {
    /**
     * Internal helper method that translates an operation to a KeyRange object.
     * @param {Query.OPERATORS} op The operator of the query.
     * @param {*} value The first operand of the query.
     * @param {*} [value2] The optional second operand of the query.
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
        Log.e(`Unknown operator: ${op}`);
        throw new Error('Unknown operator');
    }

    /**
     * Returns the conjunction of multiple queries.
     * @param {...Query} var_args The list of queries, which all have to be fulfilled.
     * @returns {Query} The conjunction of the queries.
     */
    static and(var_args) {
        const args = Array.from(arguments);
        return new Query(args, Query.OPERATORS.AND);
    }

    /**
     * Returns the disjunction of multiple queries.
     * @param {...Query} var_args The list of queries, out of which at least one has to be fulfilled.
     * @returns {Query} The disjunction of the queries.
     */
    static or(var_args) {
        const args = Array.from(arguments);
        return new Query(args, Query.OPERATORS.OR);
    }

    /**
     * Returns a query for the max key of an index.
     * @param {string} indexName The name of the index, whose maximal key the query matches.
     * @returns {Query} The query for the max key of the index.
     */
    static max(indexName) {
        return new Query(indexName, Query.OPERATORS.MAX);
    }

    /**
     * Returns a query for the min key of an index.
     * @param {string} indexName The name of the index, whose minimal key the query matches.
     * @returns {Query} The query for the min key of the index.
     */
    static min(indexName) {
        return new Query(indexName, Query.OPERATORS.MIN);
    }

    /**
     * Returns a query that matches all keys of an index that are less than a value.
     * The query matches all keys k, such that k < val.
     * @param {string} indexName The name of the index.
     * @param {*} val The upper bound of the query.
     * @returns {Query} The resulting query object.
     */
    static lt(indexName, val) {
        return new Query(indexName, Query.OPERATORS.LT, val);
    }

    /**
     * Returns a query that matches all keys of an index that are less or equal than a value.
     * The query matches all keys k, such that k ≤ val.
     * @param {string} indexName The name of the index.
     * @param {*} val The upper bound of the query.
     * @returns {Query} The resulting query object.
     */
    static le(indexName, val) {
        return new Query(indexName, Query.OPERATORS.LE, val);
    }

    /**
     * Returns a query that matches all keys of an index that are greater than a value.
     * The query matches all keys k, such that k > val.
     * @param {string} indexName The name of the index.
     * @param {*} val The lower bound of the query.
     * @returns {Query} The resulting query object.
     */
    static gt(indexName, val) {
        return new Query(indexName, Query.OPERATORS.GT, val);
    }

    /**
     * Returns a query that matches all keys of an index that are greater or equal than a value.
     * The query matches all keys k, such that k ≥ val.
     * @param {string} indexName The name of the index.
     * @param {*} val The lower bound of the query.
     * @returns {Query} The resulting query object.
     */
    static ge(indexName, val) {
        return new Query(indexName, Query.OPERATORS.GE, val);
    }

    /**
     * Returns a query that matches all keys of an index that equal to a value.
     * The query matches all keys k, such that k = val.
     * @param {string} indexName The name of the index.
     * @param {*} val The value to look for.
     * @returns {Query} The resulting query object.
     */
    static eq(indexName, val) {
        return new Query(indexName, Query.OPERATORS.EQ, val);
    }

    /**
     * Returns a query that matches all keys of an index that are between two values, excluding the boundaries.
     * The query matches all keys k, such that lower < k < upper.
     * @param {string} indexName The name of the index.
     * @param {*} lower The lower bound.
     * @param {*} upper The upper bound.
     * @returns {Query} The resulting query object.
     */
    static between(indexName, lower, upper) {
        return new Query(indexName, Query.OPERATORS.BETWEEN, lower, upper);
    }

    /**
     * Returns a query that matches all keys of an index that are between two values, including the boundaries.
     * The query matches all keys k, such that lower ≤ k ≤ upper.
     * @param {string} indexName The name of the index.
     * @param {*} lower The lower bound.
     * @param {*} upper The upper bound.
     * @returns {Query} The resulting query object.
     */
    static within(indexName, lower, upper) {
        return new Query(indexName, Query.OPERATORS.WITHIN, lower, upper);
    }

    /**
     * Internal constructor for a query.
     * Should not be called directly.
     * @param {string|Array.<Query>} arg Either a list of queries or an index name (depending on the operator).
     * @param {Query.OPERATORS} op The operator to apply.
     * @param {*} [value] The first operand if applicable.
     * @param {*} [value2] The second operand if applicable.
     * @private
     */
    constructor(arg, op, value, value2) {
        // If first argument is an array of queries, this is a combined query.
        if (Array.isArray(arg)) {
            if (arg.some(it => !(it instanceof Query))) {
                throw new Error('Invalid query');
            }
            if (Query.COMBINED_OPERATORS.indexOf(op) < 0) {
                throw new Error('Unknown operator');
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
                throw new Error('Unknown operator');
            }
            this._indexName = arg;
        }
    }

    /**
     * Returns a promise of an array of objects fulfilling this query.
     * @param {IObjectStore} objectStore The object store to execute the query on.
     * @returns {Promise.<Array.<*>>} A promise of the array of objects relevant to this query.
     */
    async values(objectStore) {
        const keys = await this._execute(objectStore);
        const resultPromises = [];
        for (const key of keys) {
            resultPromises.push(objectStore.get(key));
        }
        return Promise.all(resultPromises);
    }

    /**
     * Returns a promise of a set of keys fulfilling this query.
     * @param {IObjectStore} objectStore The object store to execute the query on.
     * @returns {Promise.<Set.<string>>} A promise of the set of keys relevant to this query.
     */
    keys(objectStore) {
        return this._execute(objectStore);
    }

    /**
     * Internal method to execute a query on an object store.
     * @param {IObjectStore} objectStore The object store to execute the query on.
     * @returns {Promise.<Set.<string>>} A promise of the set of keys relevant to this query.
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
     * Internal method for and/or operators.
     * @param {IObjectStore} objectStore The object store to execute the query on.
     * @returns {Promise.<Set.<string>>} A promise of the set of keys relevant to this query.
     * @private
     */
    async _executeCombined(objectStore) {
        // Evaluate children.
        const resultPromises = [];
        for (const query of this._queries) {
            resultPromises.push(query._execute(objectStore));
        }
        const results = await Promise.all(resultPromises);

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
     * Internal method for min/max operators.
     * @param {IObjectStore} objectStore The object store to execute the query on.
     * @returns {Promise.<Set.<string>>} A promise of the set of keys relevant to this query.
     * @private
     */
    async _executeAdvanced(objectStore) {
        const index = objectStore.index(this._indexName);
        let results = new Set();
        switch (this._op) {
            case Query.OPERATORS.MAX:
                results = await index.maxKeys();
                break;
            case Query.OPERATORS.MIN:
                results = await index.minKeys();
                break;
        }
        return new Set(results);
    }

    /**
     * Internal method for range operators.
     * @param {IObjectStore} objectStore The object store to execute the query on.
     * @returns {Promise.<Set.<string>>} A promise of the set of keys relevant to this query.
     * @private
     */
    async _executeRange(objectStore) {
        const index = objectStore.index(this._indexName);
        return new Set(await index.keys(this._keyRange));
    }
}
/**
 * Enum for supported operators.
 * @enum {number}
 */
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
/**
 * Enum for query types.
 * Each operator belongs to one of these types as specified above.
 * @enum {number}
 */
Query.Type = {
    RANGE: 0,
    ADVANCED: 1,
    COMBINED: 2
};
Class.register(Query);

