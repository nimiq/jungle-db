/**
 * Calculates the union of two sets.
 * Method of Set.
 * @memberOf Set
 * @param {Set} setB The second set.
 * @returns {Set} The union of this set and the second set.
 */
Set.prototype.union = function(setB) {
    const union = new Set(this);
    for (const elem of setB) {
        union.add(elem);
    }
    return union;
};

/**
 * Calculates the intersection of two sets.
 * Method of Set.
 * @memberOf Set
 * @param {Set} setB The second set.
 * @returns {Set} The intersection of this set and the second set.
 */
Set.prototype.intersection = function(setB) {
    const intersection = new Set();
    for (const elem of setB) {
        if (this.has(elem)) {
            intersection.add(elem);
        }
    }
    return intersection;
};

/**
 * Calculates the difference of two sets.
 * Method of Set.
 * @memberOf Set
 * @param {Set} setB The second set.
 * @returns {Set} The difference of this set and the second set.
 */
Set.prototype.difference = function(setB) {
    const difference = new Set(this);
    for (const elem of setB) {
        difference.delete(elem);
    }
    return difference;
};

/**
 * Checks whether two sets are equal to each other.
 * Method of Set.
 * @memberOf Set
 * @param {Set} setB The second set.
 * @returns {boolean} True if they contain the same elements, false otherwise.
 */
Set.prototype.equals = function(setB) {
    if (this.size !== setB.size) return false;
    for (const elem of setB) {
        if (!this.has(elem)) {
            return false;
        }
    }
    return true;
};

/**
 * Limits the number of items in the set.
 * @param {number} [limit] Limits the number of results if given.
 * @returns {Set}
 */
Set.prototype.limit = function(limit = null) {
    if (limit === null) return this;

    const limitedResults = new Set();
    let count = 0;
    for (const val of this) {
        // Limit
        if (limit !== null && count >= limit) break;

        limitedResults.add(val);
        count++;
    }
    return limitedResults;
};

/**
 * Creates a Set from single values and iterables.
 * If arg is not iterable, it creates a new Set with arg as its single member.
 * If arg is iterable, it iterates over arg and puts all items into the Set.
 * Static method of Set.
 * @memberOf Set
 * @param {*} arg The argument to create the Set from.
 * @returns {Set} The resulting Set.
 */
Set.from = function(arg) {
    // Check if iterable and not string.
    if (arg && typeof arg[Symbol.iterator] === 'function' && typeof arg !== 'string') {
        return new Set(arg);
    }
    return new Set([arg]);
};

/**
 * Returns an element of a Set.
 * Static method of Set.
 * @memberOf Set
 * @template T
 * @param {Set.<T>} s The set to return an element from.
 * @returns {T} An element of the set.
 */
Set.sampleElement = function(s) {
    return s.size > 0 ? s.values().next().value : undefined;
};
