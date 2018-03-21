describe('GenericValueEncoding', () => {
    const f = data => {
        expect(GenericValueEncoding.decode(GenericValueEncoding.encode(data))).toEqual(data);
    };

    it('correctly encodes/decodes strings', () => {
        f('test');
        f('long string with a lot of characters =');
    });

    it('correctly encodes/decodes integers', () => {
        f(0);
        f(1);
        f(125);
        f(255);
        f(256);
        f(123456789);
    });

    it('correctly encodes/decodes buffers', () => {
        f(new Uint8Array([1,2,3,4]));
    });

    it('correctly encodes/decodes objects', () => {
        f({
            test: 123,
            abc: 'def'
        });
    });
});
