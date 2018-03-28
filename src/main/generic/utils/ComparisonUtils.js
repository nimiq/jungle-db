class ComparisonUtils {
    /**
     * @param {*} a
     * @param {*} b
     * @return {boolean}
     */
    static equals(a, b) {
        // Primitive values
        if (a === b) return true;

        // Set
        if (a instanceof Set && b instanceof Set) return a.equals(b);

        // ArrayBuffer/Uint8Array/Buffer
        if (ComparisonUtils.isUint8Array(a) && ComparisonUtils.isUint8Array(b)) return BufferUtils.equals(new Uint8Array(a), new Uint8Array(b));

        return false;
    }

    /**
     * @param {*} a
     * @param {*} b
     * @return {boolean}
     */
    static compare(a, b) {
        // ArrayBuffer/Uint8Array/Buffer
        if (ComparisonUtils.isUint8Array(a) && ComparisonUtils.isUint8Array(b)) return BufferUtils.compare(new Uint8Array(a), new Uint8Array(b));

        // Primitive values
        if (a < b) return -1;
        if (a > b) return 1;

        return 0;
    }

    /**
     * @param {*} obj
     * @returns {boolean}
     */
    static isUint8Array(obj) {
        if (typeof Buffer !== 'undefined' && typeof window === 'undefined' && obj instanceof Buffer) return true;
        return ArrayBuffer.isView(obj) || obj instanceof ArrayBuffer;
    }
}
Class.register(ComparisonUtils);
