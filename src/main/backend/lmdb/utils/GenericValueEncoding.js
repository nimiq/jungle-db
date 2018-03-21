class GenericValueEncoding {
    static _encodeInteger(value) {
        const binary = new Uint8Array(9);
        const dv = new DataView(binary.buffer);
        dv.setUint8(0, GenericValueEncoding.Type.INTEGER);
        dv.setUint32(1, Math.floor(value / Math.pow(2, 32)));
        dv.setUint32(5, value);
        return binary;
    }
    static _decodeInteger(binary) {
        const dv = new DataView(binary.buffer);
        return dv.getUint32(1) * Math.pow(2, 32) + dv.getUint32(5);
    }

    static _encodeString(string, type = GenericValueEncoding.Type.STRING) {
        const buf = new Uint8Array(string.length + 1);
        buf[0] = type;
        for (let i = 0; i < string.length; ++i) {
            buf[i + 1] = string.charCodeAt(i);
        }
        return buf;
    }
    static _decodeString(buffer) {
        return String.fromCharCode.apply(null, buffer.subarray(1));
    }

    static _encodeOther(obj) {
        return GenericValueEncoding._encodeString(JungleDB.JSON_ENCODING.encode(obj), GenericValueEncoding.Type.JSON);
    }
    static _decodeOther(buffer) {
        return JungleDB.JSON_ENCODING.decode(GenericValueEncoding._decodeString(buffer));
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
            return GenericValueEncoding._encodeInteger(data);
        }
        if (typeof data === 'string') {
            return this._encodeString(data);
        }
        if (data instanceof Uint8Array) {
            return GenericValueEncoding._encodeBuffer(data);
        }
        return GenericValueEncoding._encodeOther(data);
    }

    static decode(data) {
        const type = data[0];
        switch (type) {
            case GenericValueEncoding.Type.INTEGER:
                return GenericValueEncoding._decodeInteger(data);
            case GenericValueEncoding.Type.STRING:
                return GenericValueEncoding._decodeString(data);
            case GenericValueEncoding.Type.BUFFER:
                return GenericValueEncoding._decodeBuffer(data);
            default:
                return GenericValueEncoding._decodeOther(data);
        }
    }

    static get encoding() {
        return JungleDB.Encoding.BINARY;
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
