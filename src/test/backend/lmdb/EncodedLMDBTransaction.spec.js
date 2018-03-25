describe('EncodedLMDBTransaction', () => {

    it('can set and retrieve values', () => {
        const tx = new EncodedLMDBTransaction(null);

        tx.remove('other');
        tx.remove('other1', 'val');
        tx.put('test1', 'test1');
        tx.put('test1', 'test2');
        tx.truncate();

        expect(tx.backend).toBe(null);
        expect(tx.byteSize).toBe(40);
        expect(tx.modified).toEqual([['test1', 'test1'], ['test1', 'test2']]);
        expect(tx.removed.equals(new Set(['other', 'other1']))).toBe(true);
        expect(tx.removedValue('other')).toBeUndefined();
        expect(tx.removedValue('other1')).toBe('val');
        expect(tx.truncated).toBe(true);
    });

    it('correctly estimates string byte size', () => {
        const tx = new EncodedLMDBTransaction(null);

        tx.put('test', 'test');

        expect(tx.byteSize).toBe(16);
    });

    it('correctly estimates integer byte size', () => {
        const tx = new EncodedLMDBTransaction(null);

        tx.put(1, 0);

        expect(tx.byteSize).toBe(16);
    });

    it('correctly estimates buffer byte size', () => {
        const tx = new EncodedLMDBTransaction(null);

        tx.put(new Uint8Array(10), new Uint8Array(10));

        expect(tx.byteSize).toBe(20);
    });
});
