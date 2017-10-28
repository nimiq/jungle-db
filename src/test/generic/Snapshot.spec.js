describe('Snapshot', () => {
    /** @type {ObjectStore} */
    let objectStore;
    /** @type {JungleDB} */
    let db;

    const setEqual = function(actual, expected) {
        return expected.equals(actual);
    };

    beforeEach((done) => {
        db = new JDB.JungleDB('test', 1);
        objectStore = db.createObjectStore('testStore');

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

            expect(await objectStore.get('key0')).toBeUndefined();
            expect(await objectStore.get('key1')).toBe('test');
            expect(await objectStore.get('key2')).toBe('test');

            for (let i=0; i<10; ++i) {
                expect(await snap.get(`key${i}`)).toBe(`value${i}`);
            }

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

    it('is not possible on uncommitted transactions', (done) => {
        (async function () {
            const tx = objectStore.transaction();
            try {
                await tx.snapshot();
                expect(true).toBe(false);
            } catch(e) {
                expect(true).toBe(true);
            }
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
});
