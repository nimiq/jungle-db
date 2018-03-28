/**
 * This interface represents a low level encoding for LevelDB.
 * @interface
 */
class ILMDBEncoding {
    /**
     * Encodes an object before storing it in the database.
     * @abstract
     * @param {*} obj The object to encode before storing it.
     * @returns {*} Encoded object.
     */
    encode(obj) {} // eslint-disable-line no-unused-vars

    /**
     * Decodes an object after loading it from the database.
     * @abstract
     * @param {*} obj The object to decode.
     * @returns {*} Decoded object.
     */
    decode(obj) {} // eslint-disable-line no-unused-vars

    /**
     * Whether this encoding stores data as buffers.
     * @type {boolean}
     */
    get buffer() {}

    /**
     * A name for this encoding.
     * @type {string}
     */
    get type() {}
}
