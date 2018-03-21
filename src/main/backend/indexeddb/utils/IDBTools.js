class IDBTools {
    /**
     * Converts our KeyRange objects into IDBKeyRange objects.
     * @param {KeyRange} keyRange A KeyRange object.
     * @returns {IDBKeyRange} The corresponding IDBKeyRange.
     */
    static convertKeyRange(keyRange) {
        if (!(keyRange instanceof KeyRange)) return keyRange;
        if (keyRange.exactMatch) {
            return IDBKeyRange.only(keyRange.lower);
        }
        if (keyRange.lower !== undefined && keyRange.upper === undefined) {
            return IDBKeyRange.lowerBound(keyRange.lower, keyRange.lowerOpen);
        }
        if (keyRange.upper !== undefined && keyRange.lower === undefined) {
            return IDBKeyRange.upperBound(keyRange.upper, keyRange.upperOpen);
        }
        return IDBKeyRange.bound(keyRange.lower, keyRange.upper, keyRange.lowerOpen, keyRange.upperOpen);
    }
}
Class.register(IDBTools);
