/**
 * @interface
 */
class IBTree {
    /** @type {number} */
    get length() {}

    /** @type {*} */
    get currentKey() {}

    /** @type {*} */
    get currentRecord() {}

    insert(key, rec) {}

    remove(key) {}

    seek(key, near=BTree.NEAR_MODE.NONE) {}

    skip(cnt = 1) {}

    goto(cnt) {}

    keynum() {}

    goTop() {}

    goBottom() {}

    pack() {}

    goToLowerBound(lower, lowerOpen=false) {}

    goToUpperBound(upper, upperOpen=false) {}
}
