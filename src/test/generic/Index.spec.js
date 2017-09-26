describe('Index', () => {
    const setEqual = function(actual, expected) {
        return expected.equals(actual);
    };

    let originalTimeout;

    beforeEach(function() {
        originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;
        jasmine.addCustomEqualityTester(setEqual);
    });

    afterEach(function() {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
    });

    it('can access longer keypaths', (done) => {
        (async function () {
            // Write something into an object store.
            let db = new JDB.JungleDB('indexTest', 1);
            let st = db.createObjectStore('testStore');
            st.createIndex('testIndex', 'val');
            st.createIndex('testIndex2', ['a', 'b']);

            await db.connect();

            await st.put('test', {'val': 123, 'a': {'b': 1}});

            expect((await st.get('test')).val).toBe(123);
            expect(await st.keys(JDB.Query.eq('testIndex', 123))).toEqual(new Set(['test']));
            expect(await st.keys(JDB.Query.eq('testIndex2', 1))).toEqual(new Set(['test']));

            await db.destroy();
        })().then(done, done.fail);
    });
});
