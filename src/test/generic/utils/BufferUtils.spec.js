describe('BufferUtils', () => {

    it('has fromBase64 and toBase64 methods', () => {
        expect(BufferUtils.toBase64(BufferUtils.fromBase64('dGVzdA=='))).toEqual('dGVzdA==');
        // Also allow eqs to be missing in input
        expect(BufferUtils.toBase64(BufferUtils.fromBase64('dGVzdA'))).toEqual('dGVzdA==');
    });

});
