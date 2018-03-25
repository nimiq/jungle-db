describe('Index', () => {
    let originalTimeout;

    beforeEach(function() {
        originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;
    });

    afterEach(function() {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
    });

    it('does not fill up index if not properly removed', (done) => {
        (async function () {
            // Write something into an object store.
            let db = new JungleDB('indexTest', 1);
            let st = db.createObjectStore('testStore');
            st.createIndex('depth', ['a', 'b']);
            await db.connect();

            await st.put('test', {'val': 123, 'a': {'b': 1}});
            await st.put('test2', 'other');

            expect(await st.index('depth').count()).toBe(1);

            await db.close();

            // 2nd connection
            db = new JungleDB('indexTest', 1);
            st = db.createObjectStore('testStore');
            await db.connect();

            await st.put('test3', {'val': 123, 'a': {'b': 1}});

            await db.close();

            // 3nd connection
            db = new JungleDB('indexTest', 1);
            st = db.createObjectStore('testStore');
            st.createIndex('depth', ['a', 'b']);
            await db.connect();

            await st.put('test4', {'val': 123, 'a': {'b': 1}});

            expect(await st.index('depth').count()).toBe(2);

            await db.destroy();
        })().then(done, done.fail);
    });
});
