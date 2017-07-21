/**
 * @implements IKeyRange
 */
class KeyRange {
    /**
     * @param {*} lower
     * @param {*} upper
     * @param {boolean} lowerOpen
     * @param {boolean} upperOpen
     */
    constructor(lower, upper, lowerOpen, upperOpen) {
        this._lower = lower;
        this._upper = upper;
        this._lowerOpen = lowerOpen;
        this._upperOpen = upperOpen;
    }

    /** @type {*} */
    get lower() {
        return this._lower;
    }

    /** @type {*} */
    get upper() {
        return this._upper;
    }

    /** @type {boolean} */
    get lowerOpen() {
        return this._lowerOpen;
    }

    /** @type {boolean} */
    get upperOpen() {
        return this._upperOpen;
    }

    /** @type {boolean} */
    get exactMatch() {
        return this._lower === this._upper && !this._lowerOpen && !this.upperOpen;
    }

    /**
     * @param {*} key
     * @returns {boolean}
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
     * @param {*} upper
     * @param {boolean} upperOpen
     * @returns {IKeyRange}
     */
    static upperBound(upper, upperOpen=false) {
        return new KeyRange(undefined, upper, false, upperOpen);
    }

    /**
     * If lowerOpen is false, all keys ≥ lower,
     * all keys > lower otherwise.
     * @param {*} lower
     * @param {boolean} lowerOpen
     * @returns {IKeyRange}
     */
    static lowerBound(lower, lowerOpen=false) {
        return new KeyRange(lower, undefined, lowerOpen, false);
    }

    /**
     * @param {*} lower
     * @param {*} upper
     * @param {boolean} lowerOpen
     * @param {boolean} upperOpen
     * @returns {IKeyRange}
     */
    static bound(lower, upper, lowerOpen=false, upperOpen=false) {
        return new KeyRange(lower, upper, lowerOpen, upperOpen);
    }

    /**
     * all keys = value
     * @param {*} value
     * @returns {IKeyRange}
     */
    static only(value) {
        return new KeyRange(value, value, false, false);
    }
}
Class.register(KeyRange);
