class BufferUtils {
    static _codePointTextDecoder(u8) {
        if (typeof TextDecoder === 'undefined') throw new Error('TextDecoder not supported');
        if (BufferUtils._ISO_8859_15_DECODER === null) throw new Error('TextDecoder does not supprot iso-8859-15');
        if (BufferUtils._ISO_8859_15_DECODER === undefined) {
            try {
                BufferUtils._ISO_8859_15_DECODER = new TextDecoder('iso-8859-15');
            } finally {
                BufferUtils._ISO_8859_15_DECODER = null;
            }
        }
        return BufferUtils._ISO_8859_15_DECODER.decode(u8)
            .replace('€', '¤').replace('Š', '¦').replace('š', '¨').replace('Ž', '´')
            .replace('ž', '¸').replace('Œ', '¼').replace('œ', '½').replace('Ÿ', '¾');
    }

    static _tripletToBase64(num) {
        return BufferUtils._BASE64_LOOKUP[num >> 18 & 0x3F] + BufferUtils._BASE64_LOOKUP[num >> 12 & 0x3F] + BufferUtils._BASE64_LOOKUP[num >> 6 & 0x3F] + BufferUtils._BASE64_LOOKUP[num & 0x3F];
    }

    static _base64encodeChunk(u8, start, end) {
        let tmp;
        const output = [];
        for (let i = start; i < end; i += 3) {
            tmp = ((u8[i] << 16) & 0xFF0000) + ((u8[i + 1] << 8) & 0xFF00) + (u8[i + 2] & 0xFF);
            output.push(BufferUtils._tripletToBase64(tmp));
        }
        return output.join('');
    }

    static _base64fromByteArray(u8) {
        let tmp;
        const len = u8.length;
        const extraBytes = len % 3; // if we have 1 byte left, pad 2 bytes
        let output = '';
        const parts = [];
        const maxChunkLength = 16383; // must be multiple of 3

        // go through the array every three bytes, we'll deal with trailing stuff later
        for (let i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
            parts.push(BufferUtils._base64encodeChunk(u8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)));
        }

        // pad the end with zeros, but make sure to not forget the extra bytes
        if (extraBytes === 1) {
            tmp = u8[len - 1];
            output += BufferUtils._BASE64_LOOKUP[tmp >> 2];
            output += BufferUtils._BASE64_LOOKUP[(tmp << 4) & 0x3F];
            output += '==';
        } else if (extraBytes === 2) {
            tmp = (u8[len - 2] << 8) + (u8[len - 1]);
            output += BufferUtils._BASE64_LOOKUP[tmp >> 10];
            output += BufferUtils._BASE64_LOOKUP[(tmp >> 4) & 0x3F];
            output += BufferUtils._BASE64_LOOKUP[(tmp << 2) & 0x3F];
            output += '=';
        }

        parts.push(output);

        return parts.join('');
    }

    /**
     * @param {*} buffer
     * @return {string}
     */
    static toBase64(buffer) {
        if (typeof Buffer !== 'undefined' && typeof window === 'undefined') {
            return new Buffer(buffer).toString('base64');
        } else if (typeof TextDecoder !== 'undefined' && BufferUtils._ISO_8859_15_DECODER !== null) {
            try {
                return btoa(BufferUtils._codePointTextDecoder(new Uint8Array(buffer)));
            } catch (e) {
                // Disabled itself
            }
        }

        return BufferUtils._base64fromByteArray(new Uint8Array(buffer));
    }

    /**
     * @param {string} base64
     * @return {Uint8Array}
     */
    static fromBase64(base64) {
        return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    }
}
BufferUtils.BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
BufferUtils._BASE64_LOOKUP = [];
for (let i = 0, len = BufferUtils.BASE64_ALPHABET.length; i < len; ++i) {
    BufferUtils._BASE64_LOOKUP[i] = BufferUtils.BASE64_ALPHABET[i];
}
Class.register(BufferUtils);
