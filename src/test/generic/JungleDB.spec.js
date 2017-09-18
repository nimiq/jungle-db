describe('JungleDB', () => {

    it('can connect', (done) => {
        let called = false;

        const db = new JDB.JungleDB('test', 1, () => {
            called = true;
        });

        db.connect().then(() => {
            expect(called).toBe(true);
            expect(db._dbVersion).toBe(1);
            db.destroy().then(done);
        });
    });

    it('can reconnect to a database', (done) => {
        let called = false;
        (async function () {
            let db = new JDB.JungleDB('test', 1, () => {
                called = true;
            });
            await db.connect();
            expect(called).toBe(true);
            expect(db._dbVersion).toBe(1);
            await db.close();

            called = false;
            db = new JDB.JungleDB('test', 1, () => {
                called = true;
            });
            await db.connect();
            expect(called).toBe(false);
            expect(db._dbVersion).toBe(1);
            await db.close();

            called = false;
            db = new JDB.JungleDB('test', 2, () => {
                called = true;
            });
            await db.connect();
            expect(called).toBe(true);
            expect(db._dbVersion).toBe(2);
            await db.destroy();
        })().then(done, done.fail);
    });

    it('can create and delete object stores', (done) => {
        (async function () {
            // Write something into an object store.
            let db = new JDB.JungleDB('test', 1);
            let st = db.createObjectStore('testStore');
            await db.connect();
            await st.put('test', 'succeeded');
            await db.close();

            // And test whether it is still there.
            db = new JDB.JungleDB('test', 1);
            st = db.createObjectStore('testStore');
            await db.connect();
            expect(await st.get('test')).toBe('succeeded');
            await db.close();

            // Delete it now.
            db = new JDB.JungleDB('test', 2);
            await db.deleteObjectStore('testStore');
            await db.connect();
            await db.close();

            // And check that is has been deleted.
            db = new JDB.JungleDB('test', 3);
            st = db.createObjectStore('testStore');
            await db.connect();
            expect(await st.get('test')).toBe(undefined);
            await db.destroy();
        })().then(done, done.fail);
    });
});
