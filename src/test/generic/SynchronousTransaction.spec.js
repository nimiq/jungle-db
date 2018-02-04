describe('SynchronousTransaction', () => {
    let objectStore;
    /** @type {SynchronousTransaction} */
    let tx;

    beforeEach((done) => {
        objectStore = JungleDB.createVolatileObjectStore();
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
        if (tx.state === Transaction.STATE.OPEN) {
            tx.abort().then(done, done.fail);
        }
        done();
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
            expect(tx.getSync('key2', false)).toBe(undefined);
            expect(tx.getSync('test', false)).toBe(undefined);
        })().then(done, done.fail);
    });

    it('can change values and commit', (done) => {
        (async function () {
            tx.putSync('key0', { i: 1337, sub: 'test' });
            tx.putSync('key5', { i: 1337, sub: 'test2' });
            tx.removeSync('key3');
            expect(tx.getSync('key0').sub).toBe('test');
            expect(tx.getSync('key5').sub).toBe('test2');
            expect(tx.getSync('key3', false)).toBe(undefined);

            expect(await tx.commit()).toBe(true);
            expect((await objectStore.get('key0')).sub).toBe('test');
            expect((await objectStore.get('key5')).sub).toBe('test2');
            expect((await objectStore.get('key3'))).toBe(undefined);
            /** @type {IIndex} */
            const index = objectStore.index('i');
            expect(await index.count(KeyRange.only(0))).toBe(0);
            expect(await index.count(KeyRange.only(5))).toBe(0);
            expect(await index.count(KeyRange.only(1337))).toBe(2);
            expect(await index.count(KeyRange.only(3))).toBe(0);
        })().then(done, done.fail);
    });

    it('correctly processes keys/values queries', () => {
        tx.putSync('test1', 'test');
        // Ordering on strings might not be as expected!
        expect((new Set(['key0', 'key1', 'key2', 'test1'])).equals(tx.keysSync())).toBe(true);
        expect((new Set(['key0', 'key1'])).equals(tx.keysSync(KeyRange.upperBound('key1')))).toBe(true);
        expect((new Set(['key1', 'key2', 'test1'])).equals(tx.keysSync(KeyRange.lowerBound('key1')))).toBe(true);
        expect((new Set(['key2', 'test1'])).equals(tx.keysSync(KeyRange.lowerBound('key1', true)))).toBe(true);

        expect(tx.valuesSync(KeyRange.only('key2'))).toEqual([tx.getSync('key2')]);
    });

    it('correctly processes min/max queries', () => {
        tx.putSync('test1', 'test');
        expect(tx.minKeySync()).toBe('key0');
        expect(tx.maxKeySync()).toBe('test1');
        expect(tx.minKeySync(KeyRange.upperBound('key1'))).toBe('key0');
        expect(tx.minKeySync(KeyRange.lowerBound('key0', true))).toBe('key1');
        expect(tx.maxKeySync(KeyRange.upperBound('key1'))).toBe('key1');

        expect(tx.minValueSync().sub).toBe('value0');
        expect(tx.maxValueSync()).toBe('test');
        expect(tx.minValueSync(KeyRange.upperBound('key1')).sub).toBe('value0');
        expect(tx.minValueSync(KeyRange.lowerBound('key0', true)).sub).toBe('value1');
        expect(tx.maxValueSync(KeyRange.upperBound('key1')).sub).toBe('value1');
    });

    it('throws errors on async methods', (done) => {
        (async function () {
            let thrown = false;
            await tx.put('test', 'test').catch(() => { thrown = true; });
            expect(thrown).toBeTruthy();

            thrown = false;
            await tx.remove('test').catch(() => { thrown = true; });
            expect(thrown).toBeTruthy();

            thrown = false;
            await tx.minValue().catch(() => { thrown = true; });
            expect(thrown).toBeTruthy();

            thrown = false;
            await tx.maxValue().catch(() => { thrown = true; });
            expect(thrown).toBeTruthy();

            thrown = false;
            await tx.minKey().catch(() => { thrown = true; });
            expect(thrown).toBeTruthy();

            thrown = false;
            await tx.maxKey().catch(() => { thrown = true; });
            expect(thrown).toBeTruthy();

            thrown = false;
            await tx.keys().catch(() => { thrown = true; });
            expect(thrown).toBeTruthy();

            thrown = false;
            await tx.values().catch(() => { thrown = true; });
            expect(thrown).toBeTruthy();

            thrown = false;
            await tx.keyStream().catch(() => { thrown = true; });
            expect(thrown).toBeTruthy();

            thrown = false;
            await tx.valueStream().catch(() => { thrown = true; });
            expect(thrown).toBeTruthy();

            thrown = false;
            await tx.count().catch(() => { thrown = true; });
            expect(thrown).toBeTruthy();

            expect(() => tx.snapshot()).toThrow();
        })().then(done, done.fail);
    });

    it('does apply nested transactions', (done) => {
        (async function () {
            const tx1 = tx.transaction();

            // Can retrieve values from underlying transactions.
            expect((await tx1.get('key0', false)).sub).toBe('value0');
            expect((await tx1.get('key3', false)).sub).toBe('value3');

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
