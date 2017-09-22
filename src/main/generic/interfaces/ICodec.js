/**
 * This interface represents a codec.
 * A codec is used to encode values before storing them into the database
 * and to decode values when retrieving them from the database.
 *
 * WARNING: By contract, it is required that decode(key, encode(obj)) == obj.
 * If this assumption is violated, unexpected behaviour might occur.
 * @interface
 */
class ICodec {
    /**
     * Encodes an object before storing it in the database.
     * @param {*} obj The object to encode before storing it.
     * @returns {*} Encoded object.
     */
    encode(obj) {} // eslint-disable-line no-unused-vars

    /**
     * Decodes an object before returning it to the user.
     * @param {*} obj The object to decode.
     * @returns {*} Decoded object.
     */
    decode(obj) {} // eslint-disable-line no-unused-vars

    /**
     * A value encoding used for the nodeJS implementation and ignored for the indexedDB.
     * For example, JungleDB.JSON_ENCODING provides a slightly modified JSON encoding supporting UInt8Arrays and Sets.
     * @type {{encode: function(val:*):*, decode: function(val:*):*, buffer: boolean, type: string}|void}
     */
    get valueEncoding() {} // eslint-disable-line no-unused-vars
}
