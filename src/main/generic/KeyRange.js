/**
 * This class represents range queries on an index (primary and secondary).
 */
class KeyRange {
    /**
     * This constructor is only used internally.
     * See static methods for constructing a KeyRange object.
     * @param {*} lower
     * @param {*} upper
     * @param {boolean} lowerOpen
     * @param {boolean} upperOpen
     * @private
     */
    constructor(lower, upper, lowerOpen, upperOpen) {
        this._lower = lower;
        this._upper = upper;
        this._lowerOpen = lowerOpen;
        this._upperOpen = upperOpen;
    }

    /** @type {*} The lower bound of the range. */
    get lower() {
        return this._lower;
    }

    /** @type {*} The upper bound of the range. */
    get upper() {
        return this._upper;
    }

    /** @type {boolean} Whether the lower bound is NOT part of the range. */
    get lowerOpen() {
        return this._lowerOpen;
    }

    /** @type {boolean} Whether the upper bound is NOT part of the range. */
    get upperOpen() {
        return this._upperOpen;
    }

    /** @type {boolean} Whether it is a query for an exact match. */
    get exactMatch() {
        return this._lower === this._upper && !this._lowerOpen && !this.upperOpen;
    }

    /**
     * Returns true if the given key is included in this range.
     * @param {*} key The key to test for.
     * @returns {boolean} True, if the key is included in the range and false otherwise.
     */
    includes(key) {
        return (this._lower === undefined
                || this._lower < key
                || (!this._lowerOpen && this._lower === key))
            && (this._upper === undefined
                || this._upper > key
                || (!this._upperOpen && this._upper === key));
    }

    /**
     * If upperOpen is false, all keys ≤ upper,
     * all keys < upper otherwise.
     * @param {*} upper The upper bound.
     * @param {boolean} upperOpen Whether the upper bound is NOT part of the range.
     * @returns {KeyRange} The corresponding KeyRange object.
     */
    static upperBound(upper, upperOpen=false) {
        return new KeyRange(undefined, upper, false, upperOpen);
    }

    /**
     * If lowerOpen is false, all keys ≥ lower,
     * all keys > lower otherwise.
     * @param {*} lower The lower bound.
     * @param {boolean} lowerOpen Whether the lower bound is NOT part of the range.
     * @returns {KeyRange} The corresponding KeyRange object.
     */
    static lowerBound(lower, lowerOpen=false) {
        return new KeyRange(lower, undefined, lowerOpen, false);
    }

    /**
     * A range bounded by both a lower and upper bound.
     * lowerOpen and upperOpen decide upon whether < (open) or ≤ (inclusive) comparisons
     * should be used for comparison.
     * @param {*} lower The lower bound.
     * @param {*} upper The upper bound.
     * @param {boolean} lowerOpen Whether the lower bound is NOT part of the range.
     * @param {boolean} upperOpen Whether the upper bound is NOT part of the range.
     * @returns {KeyRange} The corresponding KeyRange object.
     */
    static bound(lower, upper, lowerOpen=false, upperOpen=false) {
        return new KeyRange(lower, upper, lowerOpen, upperOpen);
    }

    /**
     * A range matching only exactly one value.
     * @param {*} value The value to match.
     * @returns {KeyRange} The corresponding KeyRange object.
     */
    static only(value) {
        return new KeyRange(value, value, false, false);
    }
}
Class.register(KeyRange);
