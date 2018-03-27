describe('SynchronousTransaction', () => {
    let objectStore;
    /** @type {SynchronousTransaction} */
    let tx;

    beforeEach((done) => {
        // Asynchronous backend.
        objectStore = new ObjectStore(new UnsynchronousBackend(new InMemoryBackend()), null);
        objectStore.createIndex('i');

        (async function () {
            // Add 10 objects.
            for (let i=0; i<10; ++i) {
                await objectStore.put(`key${i}`, { i: i, sub: `value${i}` });
            }

            tx = objectStore.synchronousTransaction();
            await tx.preload(['key0', 'key1', 'test', 'key2']);
        })().then(done, done.fail);
    });

    afterEach((done) => {
        (async function () {
            if (tx.state === Transaction.STATE.OPEN) {
                await tx.abort();
            }
        })().then(done, done.fail);
    });

    it('throws an error if a key is not cached', () => {
        const tx = objectStore.synchronousTransaction();
        expect(() => tx.getSync('key0')).toThrow();
    });

    it('can preload keys', (done) => {
        (async function () {
            const tx = objectStore.synchronousTransaction();
            await tx.preload(['key0', 'key1', 'test']);
            expect(tx.getSync('key0').sub).toBe('value0');
            expect(tx.getSync('key1').sub).toBe('value1');
            expect(tx.getSync('key2', false)).toBeUndefined();
            expect(tx.getSync('test', false)).toBeUndefined();

            expect((await tx.get('key0')).sub).toBe('value0');
            expect((await tx.get('key1')).sub).toBe('value1');
            expect((await tx.get('key2')).sub).toBe('value2');
            expect(await tx.get('test')).toBeUndefined();

            expect(tx.getSync('key2').sub).toBe('value2');
        })().then(done, done.fail);
    });

    it('can change values and commit', (done) => {
        (async function () {
            tx.putSync('key0', { i: 1337, sub: 'test' });
            tx.putSync('key5', { i: 1337, sub: 'test2' });
            await tx.put('async', { i: 1337, sub: 'test3' });
            tx.removeSync('key3');
            expect(tx.getSync('key0').sub).toBe('test');
            expect(tx.getSync('key5').sub).toBe('test2');
            expect(tx.getSync('key3', false)).toBe(undefined);
            expect((await tx.get('key0')).sub).toBe('test');

            expect(await tx.commit()).toBe(true);
            expect((await objectStore.get('key0')).sub).toBe('test');
            expect((await objectStore.get('key5')).sub).toBe('test2');
            expect((await objectStore.get('key3'))).toBe(undefined);
            expect((await objectStore.get('async')).sub).toBe('test3');
            /** @type {IIndex} */
            const index = objectStore.index('i');
            expect(await index.count(KeyRange.only(0))).toBe(0);
            expect(await index.count(KeyRange.only(5))).toBe(0);
            expect(await index.count(KeyRange.only(1337))).toBe(3);
            expect(await index.count(KeyRange.only(3))).toBe(0);
        })().then(done, done.fail);
    });

    it('does apply nested transactions', (done) => {
        (async function () {
            const tx1 = tx.transaction();

            // Can retrieve values from underlying transactions.
            expect((await tx1.get('key0')).sub).toBe('value0');
            expect((await tx1.get('key3')).sub).toBe('value3');

            await tx1.put('test', 'foobar');
            expect(tx.getSync('test', false)).toBeUndefined();
            expect(await tx1.commit()).toBe(true);
            expect(tx.getSync('test')).toBe('foobar');
        })().then(done, done.fail);
    });

    it('does apply nested synchronous transactions', (done) => {
        (async function () {
            const tx1 = tx.synchronousTransaction();

            // Can retrieve values from underlying transactions.
            expect(tx1.getSync('key0', false).sub).toBe('value0');
            expect(tx1.getSync('key3', false)).toBeUndefined();

            tx1.putSync('test', 'foobar');
            expect(tx.getSync('test', false)).toBeUndefined();
            expect(await tx1.commit()).toBe(true);
            expect(tx.getSync('test')).toBe('foobar');
        })().then(done, done.fail);
    });
});
