class GenericValueEncoding {
    static _encodeInteger(value) {
        const binary = new Uint8Array(9);
        const dv = new DataView(binary.buffer);
        dv.setUint8(0, GenericValueEncoding.Type.INTEGER);
        dv.setUint32(1, Math.floor(value / Math.pow(2, 32)), true);
        dv.setUint32(5, value, true);
        return binary;
    }
    static _decodeInteger(binary) {
        const dv = new DataView(binary.buffer);
        return dv.getUint32(1, true) * Math.pow(2, 32) + dv.getUint32(5, true);
    }

    static _fromString(string) {
        const buf = new Uint8Array(string.length);
        for (let i = 0; i < string.length; ++i) {
            buf[i] = string.charCodeAt(i);
        }
        return buf;
    }
    static _toString(buffer) {
        return String.fromCharCode.apply(null, buffer);
    }

    static _encodeOther(obj) {
        return String.fromCharCode(GenericValueEncoding.Type.JSON) + JungleDB.JSON_ENCODING.encode(obj);
    }
    static _decodeOther(buffer) {
        return JungleDB.JSON_ENCODING.decode(buffer.substring(1));
    }

    static _encodeBuffer(buffer) {
        const buf = new Uint8Array(buffer.byteLength + 1);
        buf[0] = GenericValueEncoding.Type.BUFFER;
        buf.set(buffer, 1);
        return buf;
    }
    static _decodeBuffer(buffer) {
        return buffer.subarray(1);
    }

    static encode(data) {
        if (Number.isInteger(data)) {
            return GenericValueEncoding._toString(GenericValueEncoding._encodeInteger(data));
        }
        if (typeof data === 'string') {
            return String.fromCharCode(GenericValueEncoding.Type.STRING) + data;
        }
        if (data instanceof Uint8Array) {
            return GenericValueEncoding._toString(GenericValueEncoding._encodeBuffer(data));
        }
        return GenericValueEncoding._encodeOther(data);
    }

    static decode(data) {
        const type = data.charCodeAt(0);
        switch (type) {
            case GenericValueEncoding.Type.INTEGER:
                return GenericValueEncoding._decodeInteger(GenericValueEncoding._fromString(data));
            case GenericValueEncoding.Type.STRING:
                return data.substring(1);
            case GenericValueEncoding.Type.BUFFER:
                return GenericValueEncoding._decodeBuffer(GenericValueEncoding._fromString(data));
            default:
                return GenericValueEncoding._decodeOther(data);
        }
    }

    get buffer() {
        return false;
    }
    get type() {
        return 'generic-value-codec';
    }
}
/** @enum {number} */
GenericValueEncoding.Type = {
    INTEGER: 0,
    STRING: 1,
    JSON: 2,
    BUFFER: 3
};
Class.register(GenericValueEncoding);
