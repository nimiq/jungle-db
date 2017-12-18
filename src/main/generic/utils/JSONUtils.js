class JSONUtils {
    static stringify(value) {
        return JSON.stringify(value, JSONUtils.jsonifyType);
    }

    static parse(value) {
        return JSON.parse(value, JSONUtils.parseType);
    }

    static parseType(key, value) {
        if (value[JSONUtils.TYPE_SYMBOL]) {
            switch (value[JSONUtils.TYPE_SYMBOL]) {
                case 'Uint8Array':
                    return BufferUtils.fromBase64(value[JSONUtils.VALUE_SYMBOL]);
                case 'Set':
                    return Set.from(value[JSONUtils.VALUE_SYMBOL]);
            }
        }
        return value;
    }

    static jsonifyType(key, value) {
        if (value instanceof Uint8Array) {
            return JSONUtils.typedObject('Uint8Array', BufferUtils.toBase64(value));
        }
        if (value instanceof Set) {
            return JSONUtils.typedObject('Set', Array.from(value));
        }
        return value;
    }

    static typedObject(type, value) {
        const obj = {};
        obj[JSONUtils.TYPE_SYMBOL] = type;
        obj[JSONUtils.VALUE_SYMBOL] = value;
        return obj;
    }
}
JSONUtils.TYPE_SYMBOL = '__';
JSONUtils.VALUE_SYMBOL = 'value';

Class.register(JSONUtils);
