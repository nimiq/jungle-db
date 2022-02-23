/**
 * This interface represents a codec.
 * A codec is used to encode values before storing them into the database
 * and to decode values when retrieving them from the database.
 * The codec is only applies when storing/retrieving values in/from the backend.
 *
 * WARNING: By contract, it is required that decode(key, encode(obj)) == obj.
 * If this assumption is violated, unexpected behaviour might occur.
 *
 * LIMITATION: IndexedDB indices will use the encoded values, while all other implementations
 * build their indices on the decoded values.
 * @interface
 */
class ICodec {
    /**
     * Encodes an object before storing it in the database.
     * @abstract
     * @param {*} obj The object to encode before storing it.
     * @returns {*} Encoded object.
     */
    encode(obj) {} // eslint-disable-line no-unused-vars

    /**
     * Decodes an object before returning it to the user.
     * @abstract
     * @param {*} obj The object to decode.
     * @param {string} key The object's primary key.
     * @returns {*} Decoded object.
     */
    decode(obj, key) {} // eslint-disable-line no-unused-vars

    /**
     * A value encoding used for the LMDB implementation and ignored for the indexedDB.
     * For example, JungleDB.JSON_ENCODING provides a slightly modified JSON encoding supporting UInt8Arrays and Sets.
     * @type {ILMDBEncoding|void}
     */
    get valueEncoding() { return null; } // eslint-disable-line no-unused-vars

    /**
     * A value encoding used only for the LMDB implementation and ignored for the indexedDB.
     * For example, JungleDB.JSON_ENCODING provides a slightly modified JSON encoding supporting UInt8Arrays and Sets.
     * @type {?ILMDBEncoding}
     */
    get lmdbValueEncoding() { return null; } // eslint-disable-line no-unused-vars
}
