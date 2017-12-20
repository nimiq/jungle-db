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
            let db = new JungleDB('indexTest', 1);
            let st = db.createObjectStore('testStore');
            st.createIndex('testIndex', 'val');
            st.createIndex('testIndex2', ['a', 'b']);

            await db.connect();

            await st.put('test', {'val': 123, 'a': {'b': 1}});

            expect((await st.get('test')).val).toBe(123);
            expect(await st.keys(Query.eq('testIndex', 123))).toEqual(new Set(['test']));
            expect(await st.keys(Query.eq('testIndex2', 1))).toEqual(new Set(['test']));

            await db.destroy();
        })().then(done, done.fail);
    });

    it('can handle values not conforming to index', (done) => {
        (async function () {
            // Write something into an object store.
            let db = new JungleDB('indexTest', 1);
            let st = db.createObjectStore('testStore');
            st.createIndex('depth', ['treeInfo', 'depth']);

            await db.connect();

            // Fill object store.
            const expectedJs = new Set();
            for (let i=0; i<10; ++i) {
                for (let j=0; j<5; ++j) {
                    expectedJs.add(j);
                    await st.put(`${i}-${j}`, {'val': i*10+j, 'treeInfo': {'depth': i, 'j': j}});
                    await st.put('head', `${i*10+j}`);
                }
            }
            const tx = st.transaction();
            for (let i=10; i<50; ++i) {
                for (let j=0; j<5; ++j) {
                    expectedJs.add(j);
                    await tx.put(`${i}-${j}`, {'val': i * 10 + j, 'treeInfo': {'depth': i, 'j': j}});
                    await tx.put('head', `${i * 10 + j}`);
                }
            }
            await tx.commit();

            // Retrieve values at specific depth.
            expect(await st.get('head')).toBe(`${49*10+4}`);

            const atDepth5 = await st.values(Query.eq('depth', 5));
            const atDepth15 = await st.values(Query.eq('depth', 15));

            let actualJs = new Set();
            for (const obj of atDepth5) {
                expect(obj['treeInfo']['depth']).toBe(5);
                actualJs.add(obj['treeInfo']['j']);
            }
            expect(actualJs).toEqual(expectedJs);

            actualJs = new Set();
            for (const obj of atDepth15) {
                expect(obj['treeInfo']['depth']).toBe(15);
                actualJs.add(obj['treeInfo']['j']);
            }
            expect(actualJs).toEqual(expectedJs);

            // Retrieve values in depth range for given j.
            const range = await st.values(Query.within('depth', 5, 15));
            const expectedIs = Set.from([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
            for (let j=0; j<5; ++j) {
                const actualIs = new Set();
                for (const obj of range) {
                    if (obj['treeInfo']['j'] === j) {
                        actualIs.add(obj['treeInfo']['depth']);
                    }
                }
                expect(actualIs).toEqual(expectedIs);
            }

            await db.destroy();
        })().then(done, done.fail);
    });
});
