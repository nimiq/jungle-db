describe('Snapshot', () => {
    /** @type {ObjectStore} */
    let objectStore;
    /** @type {JungleDB} */
    let db;

    const setEqual = function(actual, expected) {
        return expected.equals(actual);
    };

    beforeEach((done) => {
        db = new JungleDB('test', 1);
        objectStore = db.createObjectStore('testStore');
        objectStore.createIndex('test', ['a', 'b'], true);

        (async function () {
            await db.connect();
            // Add 10 objects.
            for (let i=0; i<10; ++i) {
                await objectStore.put(`key${i}`, `value${i}`);
            }
        })().then(done, done.fail);

        jasmine.addCustomEqualityTester(setEqual);
    });

    afterEach((done) => {
        (async function () {
            await db.destroy();
        })().then(done, done.fail);
    });

    it('works on the backend', (done) => {
        (async function () {
            const snap = objectStore.snapshot();
            for (let i=0; i<10; ++i) {
                expect(await snap.get(`key${i}`)).toBe(`value${i}`);
            }

            await objectStore.remove('key0');
            await objectStore.remove('key2');
            await objectStore.put('key1', 'test');
            await objectStore.put('key2', 'test');
            await objectStore.put('something_new', 'nothing');
            await objectStore.put('something_new', 'test');

            expect(await objectStore.get('key0')).toBeUndefined();
            expect(await objectStore.get('key1')).toBe('test');
            expect(await objectStore.get('key2')).toBe('test');
            expect(await objectStore.get('something_new')).toBe('test');

            for (let i=0; i<10; ++i) {
                expect(await snap.get(`key${i}`)).toBe(`value${i}`);
            }
            expect(await snap.get('something_new')).toBe(undefined);

            await snap.abort();
        })().then(done, done.fail);
    });

    it('works on unflushed transaction', (done) => {
        (async function () {
            const tx1 = objectStore.transaction();
            const tx2 = objectStore.transaction();

            await tx1.put('key10', 'value10');
            await tx1.commit();

            const snap = objectStore.snapshot();

            for (let i=0; i<11; ++i) {
                expect(await snap.get(`key${i}`)).toBe(`value${i}`);
            }

            const tx3 = objectStore.transaction();
            await tx3.remove('key0');
            await tx3.remove('key2');
            await tx3.put('key1', 'test');
            await tx3.put('key2', 'test');
            await tx3.commit();

            for (let i=0; i<11; ++i) {
                expect(await snap.get(`key${i}`)).toBe(`value${i}`);
            }

            await tx2.abort();

            expect(await objectStore.get('key0')).toBeUndefined();
            expect(await objectStore.get('key1')).toBe('test');
            expect(await objectStore.get('key2')).toBe('test');

            for (let i=0; i<10; ++i) {
                expect(await snap.get(`key${i}`)).toBe(`value${i}`);
            }

            await snap.abort();
        })().then(done, done.fail);
    });

    it('works on unflushed synchronous transaction', (done) => {
        (async function () {
            const tx1 = objectStore.synchronousTransaction();
            const tx2 = objectStore.transaction();

            await tx1.put('key10', 'value10');
            await tx1.commit();

            const snap = objectStore.snapshot();

            for (let i=0; i<11; ++i) {
                expect(await snap.get(`key${i}`)).toBe(`value${i}`);
            }

            const tx3 = objectStore.transaction();
            await tx3.remove('key0');
            await tx3.remove('key2');
            await tx3.put('key1', 'test');
            await tx3.put('key2', 'test');
            await tx3.commit();

            for (let i=0; i<11; ++i) {
                expect(await snap.get(`key${i}`)).toBe(`value${i}`);
            }

            await tx2.abort();

            expect(await objectStore.get('key0')).toBeUndefined();
            expect(await objectStore.get('key1')).toBe('test');
            expect(await objectStore.get('key2')).toBe('test');

            for (let i=0; i<10; ++i) {
                expect(await snap.get(`key${i}`)).toBe(`value${i}`);
            }

            await snap.abort();
        })().then(done, done.fail);
    });

    it('can handle truncate on the backend', (done) => {
        (async function () {
            const snap = objectStore.snapshot();

            for (let i=0; i<10; ++i) {
                expect(await snap.get(`key${i}`)).toBe(`value${i}`);
            }

            await objectStore.truncate();

            for (let i=0; i<10; ++i) {
                expect(await objectStore.get('key0')).toBeUndefined();
                expect(await snap.get(`key${i}`)).toBe(`value${i}`);
            }

            await snap.abort();
        })().then(done, done.fail);
    });

    it('can inherit transactions', (done) => {
        (async function () {
            const tx1 = objectStore.transaction();

            await tx1.put('key10', 'value10');

            const snap = objectStore.snapshot();
            await snap.inherit(tx1);
            await tx1.abort();

            for (let i=0; i<11; ++i) {
                expect(await snap.get(`key${i}`)).toBe(`value${i}`);
            }

            const tx3 = objectStore.transaction();
            await tx3.remove('key0');
            await tx3.remove('key2');
            await tx3.put('key1', 'test');
            await tx3.put('key2', 'test');
            await tx3.commit();

            for (let i=0; i<11; ++i) {
                expect(await snap.get(`key${i}`)).toBe(`value${i}`);
            }

            await snap.abort();
        })().then(done, done.fail);
    });

    it('can implicitly inherit transactions', (done) => {
        (async function () {
            const tx1 = objectStore.transaction();

            await tx1.put('key10', 'value10');

            const snap = tx1.snapshot();
            await tx1.abort();

            for (let i=0; i<11; ++i) {
                expect(await snap.get(`key${i}`)).toBe(`value${i}`);
            }

            const tx3 = objectStore.transaction();
            await tx3.remove('key0');
            await tx3.remove('key2');
            await tx3.put('key1', 'test');
            await tx3.put('key2', 'test');
            await tx3.commit();

            for (let i=0; i<11; ++i) {
                expect(await snap.get(`key${i}`)).toBe(`value${i}`);
            }

            await snap.abort();
        })().then(done, done.fail);
    });

    it('can implicitly inherit nested transactions', (done) => {
        (async function () {
            const tx1 = objectStore.transaction();
            await tx1.put('key10', 'value10');

            const tx2 = tx1.transaction();
            await tx2.put('key11', 'value11');

            const snap = tx2.snapshot();
            await tx2.abort();
            await tx1.abort();

            for (let i=0; i<12; ++i) {
                expect(await snap.get(`key${i}`)).toBe(`value${i}`);
            }

            const tx3 = objectStore.transaction();
            await tx3.remove('key0');
            await tx3.remove('key2');
            await tx3.put('key1', 'test');
            await tx3.put('key2', 'test');
            await tx3.commit();

            for (let i=0; i<12; ++i) {
                expect(await snap.get(`key${i}`)).toBe(`value${i}`);
            }

            await snap.abort();
        })().then(done, done.fail);
    });

    it('can handle index queries', (done) => {
        (async function () {
            const tx1 = objectStore.transaction();
            await tx1.put('newTest', {
                'key': 'newTest',
                'a': {
                    'b': 123
                }
            });

            await tx1.put('newTest1', {
                'key': 'newTest1',
                'a': {
                    'b': 123
                }
            });

            await tx1.put('newTest2', {
                'a': {
                    'b': 124
                }
            });

            await tx1.commit();

            const snap = objectStore.snapshot();

            await objectStore.remove('newTest1');

            const index = snap.index('test');
            expect(await index.keys(KeyRange.only(123))).toEqual(new Set(['newTest', 'newTest1']));
            expect(await index.keys(KeyRange.lowerBound(123, true))).toEqual(new Set(['newTest2']));

            const values = await snap.values(Query.eq('test', 123));
            const expectedKeys = new Set(['newTest', 'newTest1']);
            for (const value of values) {
                expect(expectedKeys.delete(value['key'])).toBe(true);
            }
            expect(expectedKeys.size).toBe(0);
        })().then(done, done.fail);
    });

    it('throws errors on forbidden methods', (done) => {
        (async function () {
            const snapshot = objectStore.snapshot();
            expect(() => snapshot.truncateSync()).toThrow();
            expect(() => snapshot.putSync()).toThrow();
            expect(() => snapshot.removeSync()).toThrow();
            expect(() => snapshot.transaction()).toThrow();
            expect(() => snapshot.synchronousTransaction()).toThrow();
            expect(() => snapshot.snapshot()).toThrow();

            let threw = false;
            try {
                await snapshot.put();
            } catch (e) {
                threw = true;
            }
            expect(threw).toBe(true);

            threw = false;
            try {
                await snapshot.remove();
            } catch (e) {
                threw = true;
            }
            expect(threw).toBe(true);

            threw = false;
            try {
                await snapshot.commit();
            } catch (e) {
                threw = true;
            }
            expect(threw).toBe(true);

            await snapshot.abort();

            threw = false;
            try {
                await snapshot.abort();
            } catch (e) {
                threw = true;
            }
            expect(threw).toBe(true);
        })().then(done, done.fail);
    });
});
