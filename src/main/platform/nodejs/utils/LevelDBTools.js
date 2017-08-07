class LevelDBTools {
    /**
     * @param {KeyRange} keyRange
     * @param {Object} options
     * @returns {Object}
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
