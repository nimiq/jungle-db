describe('BufferUtils', () => {
    if (typeof window === 'undefined' && typeof require === 'function') btoa = require('btoa'); //eslint-disable-line no-global-assign

    it('has fromBase64 and toBase64 methods', () => {
        expect(BufferUtils.toBase64(BufferUtils.fromBase64('dGVzdA=='))).toEqual('dGVzdA==');
    });

    it('toBase64/fromBase64 handle all code points like btoa/atob', () => {
        const arr = [];
        for (let i = 0; i < 256; ++i) arr.push(i);
        const sb = new Uint8Array(arr);
        const tobase64 = BufferUtils.toBase64(sb);
        const withbtoa = btoa(String.fromCharCode(...sb));

        expect(tobase64).toEqual(withbtoa);
        expect(BufferUtils.fromBase64(tobase64)).toEqual(sb);
        expect(BufferUtils.fromBase64(withbtoa)).toEqual(sb);
    });

    it('has fromBase64lex and toBase64lex methods', () => {
        const arr = [];
        for (let i = 0; i < 256; ++i) arr.push(i);
        const sb = new Uint8Array(arr);
        const b64lex = BufferUtils.toBase64lex(sb);
        expect(BufferUtils.toBase64lex(BufferUtils.fromBase64lex(b64lex))).toEqual(b64lex);
    });

    it('toBase64lex/fromBase64lex handle all code points like btoa/atob', () => {
        for (let i = 1; i < 256; ++i) {
            const buf1 = GenericValueEncoding.encode(i);
            const buf2 = GenericValueEncoding.encode(i * 2);
            expect(i < i * 2).toBe(true);
            expect(BufferUtils.toBase64lex(buf1) < BufferUtils.toBase64lex(buf2)).toBe(true);
        }

        let buf1 = GenericValueEncoding.encode('aab');
        let buf2 = GenericValueEncoding.encode('aac');
        expect(BufferUtils.toBase64lex(buf1) < BufferUtils.toBase64lex(buf2)).toBe(true);

        buf1 = GenericValueEncoding.encode('aaaaa');
        buf2 = GenericValueEncoding.encode('b');
        expect(BufferUtils.toBase64lex(buf1) < BufferUtils.toBase64lex(buf2)).toBe(true);

        buf1 = GenericValueEncoding.encode(String.fromCharCode(0));
        buf2 = GenericValueEncoding.encode('b');
        let buf3 = GenericValueEncoding.encode('bb');
        let buf4 = GenericValueEncoding.encode(String.fromCharCode(65535));
        expect(BufferUtils.toBase64lex(buf1) < BufferUtils.toBase64lex(buf2)).toBe(true);
        expect(BufferUtils.toBase64lex(buf2) < BufferUtils.toBase64lex(buf3)).toBe(true);
        expect(BufferUtils.toBase64lex(buf3) < BufferUtils.toBase64lex(buf4)).toBe(true);
    });

    it('has an equals method', () => {
        const buffer1 = new Uint8Array([ 116, 101, 115, 116 ]);
        const buffer2 = new Uint8Array([ 116, 101, 115, 116 ]);
        const buffer3 = new Uint8Array([ 116, 101, 115, 116, 32, 102, 97, 108, 115, 101 ]);

        expect(BufferUtils.equals(buffer1, buffer2)).toEqual(true);
        expect(BufferUtils.equals(buffer1, buffer3)).toEqual(false);
    });

    it('has a compare method', () => {
        const buffer1 = new Uint8Array([1, 2, 3, 4]);
        const buffer2 = new Uint8Array([1, 2, 5, 4]);
        const buffer3 = new Uint8Array([1, 3, 3, 4]);

        expect(BufferUtils.compare(buffer1, buffer2)).toEqual(-1);
        expect(BufferUtils.compare(buffer1, buffer3)).toEqual(-1);
        expect(BufferUtils.compare(buffer3, buffer1)).toEqual(1);
    });
});
