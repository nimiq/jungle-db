/**
 * This interface represents a low level encoding for LevelDB.
 * @interface
 * @implements {IBasicEncoding}
 */
class ILMDBEncoding extends IBasicEncoding {
    /**
     * Whether this encoding stores data as buffers.
     * @type {boolean}
     */
    get buffer() { return false; }

    /**
     * A name for this encoding.
     * @type {string}
     */
    get type() { return ''; }
}
