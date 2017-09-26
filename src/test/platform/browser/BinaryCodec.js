/**
 * @implements {ICodec}
 */
class BinaryCodec {
    static get instance() {
        if (!BinaryCodec._instance) {
            BinaryCodec._instance = new BinaryCodec();
        }
        return BinaryCodec._instance;
    }

    /**
     * Encodes an object before storing it in the database.
     * @param {*} obj The object to encode before storing it.
     * @returns {*} Encoded object.
     */
    encode(obj) {
        return obj;
    }

    /**
     * Decodes an object before returning it to the user.
     * @param {*} obj The object to decode.
     * @returns {*} Decoded object.
     */
    decode(obj) {
        return obj;
    }

    /**
     * A value encoding used for the nodeJS implementation and ignored for the indexedDB.
     * For example, JungleDB.JSON_ENCODING provides a slightly modified JSON encoding supporting UInt8Arrays and Sets.
     * @type {{encode: function(val:*):*, decode: function(val:*):*, buffer: boolean, type: string}|void}
     */
    get valueEncoding() {
        return JDB.JungleDB.JSON_ENCODING;
    }
}
JDB.Class.register(BinaryCodec);
