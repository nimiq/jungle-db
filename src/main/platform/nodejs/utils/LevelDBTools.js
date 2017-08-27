class LevelDBTools {
    /**
     * Converts our KeyRange object into an options object for LevelDB readstreams.
     * @param {KeyRange} keyRange A KeyRange object.
     * @param {Object} [options] An options object (default empty).
     * @returns {Object} The options object given extended by the KeyRange.
     */
    static convertKeyRange(keyRange, options={}) {
        if (!(keyRange instanceof KeyRange)) return options;
        const lowerKey = keyRange.lowerOpen ? 'gt' : 'gte';
        const upperKey = keyRange.upperOpen ? 'lt' : 'lte';
        if (keyRange.lower !== undefined) {
            options[lowerKey] = keyRange.lower;
        }
        if (keyRange.upper !== undefined) {
            options[upperKey] = keyRange.upper;
        }
        return options;
    }
}
Class.register(LevelDBTools);
