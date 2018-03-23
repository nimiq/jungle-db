describe('JungleDB', () => {

    it('can connect', (done) => {
        let called = false;

        const db = new JungleDB('test', 1, () => {
            called = true;
        }, { maxDbSize: 1024*1024*100, maxDbs: 10 });

        db.connect().then(() => {
            expect(called).toBe(true);
            expect(db._dbVersion).toBe(1);
            db.destroy().then(done);
        });
    });

    it('can reconnect to a database', (done) => {
        let called = false;
        (async function () {
            let db = new JungleDB('test', 1, () => {
                called = true;
            }, { maxDbSize: 1024*1024*100, maxDbs: 10 });
            await db.connect();
            expect(called).toBe(true);
            expect(db._dbVersion).toBe(1);
            await db.close();

            called = false;
            db = new JungleDB('test', 1, () => {
                called = true;
            }, { maxDbSize: 1024*1024*100, maxDbs: 10 });
            await db.connect();
            expect(called).toBe(false);
            expect(db._dbVersion).toBe(1);
            await db.close();

            called = false;
            db = new JungleDB('test', 2, () => {
                called = true;
            }, { maxDbSize: 1024*1024*100, maxDbs: 10 });
            await db.connect();
            expect(called).toBe(true);
            expect(db._dbVersion).toBe(2);
            await db.destroy();
        })().then(done, done.fail);
    });

    it('can create and delete object stores', (done) => {
        (async function () {
            // Write something into an object store.
            let db = new JungleDB('test', 1, undefined, { maxDbSize: 1024*1024*100, maxDbs: 10 });
            let st = db.createObjectStore('testStore');
            await db.connect();
            await st.put('test', 'succeeded');
            await db.close();

            // And test whether it is still there.
            db = new JungleDB('test', 1, undefined, { maxDbSize: 1024*1024*100, maxDbs: 10 });
            st = db.createObjectStore('testStore');
            await db.connect();
            expect(await st.get('test')).toBe('succeeded');
            await db.close();

            // Delete it now.
            db = new JungleDB('test', 2, undefined, { maxDbSize: 1024*1024*100, maxDbs: 10 });
            await db.deleteObjectStore('testStore');
            await db.connect();
            await db.close();

            // And check that is has been deleted.
            db = new JungleDB('test', 3, undefined, { maxDbSize: 1024*1024*100, maxDbs: 10 });
            st = db.createObjectStore('testStore');
            await db.connect();
            expect(await st.get('test')).toBe(undefined);
            await st.put('test', 'succeeded');
            expect(await st.get('test')).toBe('succeeded');
            await db.destroy();

            // And check that destroy has worked.
            db = new JungleDB('test', 3, undefined, { maxDbSize: 1024*1024*100, maxDbs: 10 });
            st = db.createObjectStore('testStore');
            await db.connect();
            expect(await st.get('test')).toBe(undefined);
            await db.destroy();
        })().then(done, done.fail);
    });

    it('can use advanced upgrade methods (new signatures)', (done) => {
        let upgradeCall = { called: false, oldVersion: null, newVersion: null };
        async function connect(version) {
            // Write something into an object store.
            let db = new JungleDB('testme', version, (oldVersion, newVersion) => {
                upgradeCall = { called: true, oldVersion: oldVersion, newVersion: newVersion };
            }, { maxDbSize: 1024*1024*100, maxDbs: 10 });

            const store = db.createObjectStore('books', { upgradeCondition: (oldVersion) => oldVersion < 1 });
            if (version === 1) {
                db.createObjectStore('notNeeded', { upgradeCondition: (oldVersion, newVersion) => oldVersion < 1 });
            }
            const titleIndex = store.createIndex('by_title', 'title', { upgradeCondition: (oldVersion) => oldVersion < 1 });
            const authorIndex = store.createIndex('by_author', 'author', { upgradeCondition: (oldVersion) => oldVersion < 1 });

            if (version >= 2) {
                db.deleteObjectStore('notNeeded', { upgradeCondition: (oldVersion) => oldVersion === 1 });
            }

            if (version === 2) {
                // Version 2 introduces a new index of books by year.
                const yearIndex = store.createIndex('by_year', 'year', { upgradeCondition: (oldVersion) => oldVersion < 2 });
            }

            if (version >= 3) {
                // Version 3 introduces a new object store for magazines with two indexes.
                store.deleteIndex('by_year', { upgradeCondition: (oldVersion) => oldVersion === 2 });
                const magazines = db.createObjectStore('magazines', { upgradeCondition: (oldVersion) => oldVersion < 3 });
                const publisherIndex = magazines.createIndex('by_publisher', 'publisher', { upgradeCondition: (oldVersion) => oldVersion < 3 });
                const frequencyIndex = magazines.createIndex('by_frequency', 'frequency', { upgradeCondition: (oldVersion) => oldVersion < 3 });
            }

            await db.connect();

            return db;
        }

        (async function () {
            /** @type {IJungleDB} */
            let db = await connect(1);
            expect(upgradeCall.called).toBe(true);
            expect(upgradeCall.oldVersion).toBe(0);
            expect(upgradeCall.newVersion).toBe(1);

            let store = db.getObjectStore('books');
            expect(store).toBeTruthy();
            expect(store.index('by_title')).toBeTruthy();
            expect(store.index('by_author')).toBeTruthy();
            expect(store.index('by_year')).toBeFalsy();
            expect(db.getObjectStore('magazines')).toBeFalsy();
            expect(db.getObjectStore('notNeeded')).toBeTruthy();
            await db.close();

            // No changes with same version.
            upgradeCall = { called: false, oldVersion: null, newVersion: null };
            db = await connect(1);
            expect(upgradeCall.called).toBe(false);

            store = db.getObjectStore('books');
            expect(store).toBeTruthy();
            expect(store.index('by_title')).toBeTruthy();
            expect(store.index('by_author')).toBeTruthy();
            expect(store.index('by_year')).toBeFalsy();
            expect(db.getObjectStore('magazines')).toBeFalsy();
            expect(db.getObjectStore('notNeeded')).toBeTruthy();
            await db.close();

            // Upgrade to 2.
            upgradeCall = { called: false, oldVersion: null, newVersion: null };
            db = await connect(2);
            expect(upgradeCall.called).toBe(true);
            expect(upgradeCall.oldVersion).toBe(1);
            expect(upgradeCall.newVersion).toBe(2);

            store = db.getObjectStore('books');
            expect(store).toBeTruthy();
            expect(store.index('by_title')).toBeTruthy();
            expect(store.index('by_author')).toBeTruthy();
            expect(store.index('by_year')).toBeTruthy();
            expect(db.getObjectStore('magazines')).toBeFalsy();
            expect(db.getObjectStore('notNeeded')).toBeFalsy();
            await db.close();

            // Upgrade to 3.
            upgradeCall = { called: false, oldVersion: null, newVersion: null };
            db = await connect(3);
            expect(upgradeCall.called).toBe(true);
            expect(upgradeCall.oldVersion).toBe(2);
            expect(upgradeCall.newVersion).toBe(3);

            store = db.getObjectStore('books');
            expect(store).toBeTruthy();
            expect(store.index('by_title')).toBeTruthy();
            expect(store.index('by_author')).toBeTruthy();
            expect(store.index('by_year')).toBeFalsy();
            let magazines = db.getObjectStore('magazines');
            expect(magazines).toBeTruthy();
            expect(magazines.index('by_publisher')).toBeTruthy();
            expect(magazines.index('by_frequency')).toBeTruthy();
            expect(db.getObjectStore('notNeeded')).toBeFalsy();
            await db.close();

            await db.destroy();

            // Immediate upgrade to 3.
            upgradeCall = { called: false, oldVersion: null, newVersion: null };
            db = await connect(3);
            expect(upgradeCall.called).toBe(true);
            expect(upgradeCall.oldVersion).toBe(0);
            expect(upgradeCall.newVersion).toBe(3);

            store = db.getObjectStore('books');
            expect(store).toBeTruthy();
            expect(store.index('by_title')).toBeTruthy();
            expect(store.index('by_author')).toBeTruthy();
            expect(store.index('by_year')).toBeFalsy();
            magazines = db.getObjectStore('magazines');
            expect(magazines).toBeTruthy();
            expect(magazines.index('by_publisher')).toBeTruthy();
            expect(magazines.index('by_frequency')).toBeTruthy();
            expect(db.getObjectStore('notNeeded')).toBeFalsy();
            await db.close();

            await db.destroy();
        })().then(done, done.fail);
    });
});
