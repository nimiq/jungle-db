/**
 * @implements IKeyRange
 */
class KeyRange {
    /**
     * If upperOpen is false, all keys ≤ upper,
     * all keys < upper otherwise.
     * @param {*} upper
     * @param {boolean} upperOpen
     * @returns {IKeyRange}
     */
    static upperBound(upper, upperOpen=false) {
        return IDBKeyRange.upperBound(upper, upperOpen);
    }

    /**
     * If lowerOpen is false, all keys ≥ lower,
     * all keys > lower otherwise.
     * @param {*} lower
     * @param {boolean} lowerOpen
     * @returns {IKeyRange}
     */
    static lowerBound(lower, lowerOpen=false) {
        return IDBKeyRange.lowerBound(lower, lowerOpen);
    }

    /**
     * @param {*} lower
     * @param {*} upper
     * @param {boolean} lowerOpen
     * @param {boolean} upperOpen
     * @returns {IKeyRange}
     */
    static bound(lower, upper, lowerOpen=false, upperOpen=false) {
        return IDBKeyRange.bound(lower, upper, lowerOpen, upperOpen);
    }

    /**
     * all keys = value
     * @param {*} value
     * @returns {IKeyRange}
     */
    static only(value) {
        return IDBKeyRange.only(value);
    }
}
Class.register(KeyRange);
