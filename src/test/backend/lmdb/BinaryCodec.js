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
        const str = [].concat.apply([], Object.entries(obj)).join('|');
        return Buffer.from(str, 'utf8');
    }

    /**
     * Decodes an object before returning it to the user.
     * @param {*} obj The object to decode.
     * @param {string} key The object's primary key.
     * @returns {*} Decoded object.
     */
    decode(obj, key) {
        const str = obj.toString('utf-8');
        const entries = str.split('|');
        const object = {};
        for (let i = 0; i < entries.length; i += 2) {
            const key = entries[i];
            let value = entries[i+1];
            if (!isNaN(parseInt(value))) {
                value = parseInt(value);
            }
            object[key] = value;
        }
        return object;
    }

    /**
     * A value encoding used for the nodeJS implementation and ignored for the indexedDB.
     * For example, JungleDB.JSON_ENCODING provides a slightly modified JSON encoding supporting UInt8Arrays and Sets.
     * @type {{encode: function(val:*):*, decode: function(val:*):*, encoding: JungleDB.Encoding}|void}
     */
    get valueEncoding() {
        return JungleDB.BINARY_ENCODING;
    }
}
Class.register(BinaryCodec);
