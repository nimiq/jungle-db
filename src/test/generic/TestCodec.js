/**
 * @implements {ICodec}
 */
class TestCodec {
    static get instance() {
        if (!TestCodec._instance) {
            TestCodec._instance = new TestCodec();
        }
        return TestCodec._instance;
    }

    /**
     * Encodes an object before storing it in the database.
     * @param {*} obj The object to encode before storing it.
     * @returns {*} Encoded object.
     */
    encode(obj) {
        return {
            k: obj.key,
            v: obj.value
        };
    }

    /**
     * Decodes an object before returning it to the user.
     * @param {string} key The object's primary key.
     * @param {*} obj The object to decode.
     * @returns {*} Decoded object.
     */
    decode(key, obj) {
        return {
            key: key,
            value: obj.v
        };
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
JDB.Class.register(TestCodec);
