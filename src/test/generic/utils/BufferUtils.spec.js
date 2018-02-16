describe('BufferUtils', () => {
    if (typeof window === 'undefined' && typeof require === 'function') btoa = require('btoa'); //eslint-disable-line no-global-assign

    it('has fromBase64 and toBase64 methods', () => {
        expect(BufferUtils.toBase64(BufferUtils.fromBase64('dGVzdA=='))).toEqual('dGVzdA==');
        // Also allow eqs to be missing in input
        expect(BufferUtils.toBase64(BufferUtils.fromBase64('dGVzdA'))).toEqual('dGVzdA==');
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
});
