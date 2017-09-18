describe('Query', () => {
    let backend;

    const setEqual = function(actual, expected) {
        return expected.equals(actual);
    };

    beforeAll((done) => {
        backend = new DummyBackend();

        (async function () {
            await backend.createIndex('test', 'test', false);
            await backend.createIndex('multi', 'multi', true);

            // Add 10 objects.
            for (let i=0; i<10; ++i) {
                const obj = {
                    test: i,
                    multi: [i%2, i]
                };
                await backend.put(`key${i}`, obj);
            }
        })().then(done, done.fail);

        jasmine.addCustomEqualityTester(setEqual);
    });

    it('can process single entry range queries', (done) => {
        (async function () {
            expect(await backend.keys(JDB.Query.eq('test', 0))).toEqual(new Set(['key0']));
            expect(await backend.keys(JDB.Query.le('test', 1))).toEqual(new Set(['key0', 'key1']));
            expect(await backend.keys(JDB.Query.lt('test', 1))).toEqual(new Set(['key0']));
            expect(await backend.keys(JDB.Query.ge('test', 8))).toEqual(new Set(['key8', 'key9']));
            expect(await backend.keys(JDB.Query.gt('test', 7))).toEqual(new Set(['key8', 'key9']));
            expect(await backend.keys(JDB.Query.between('test', 1, 3))).toEqual(new Set(['key2']));
            expect(await backend.keys(JDB.Query.within('test', 1, 3))).toEqual(new Set(['key1', 'key2', 'key3']));
        })().then(done, done.fail);
    });

    it('can process single entry min/max queries', (done) => {
        (async function () {
            expect(await backend.keys(JDB.Query.max('test'))).toEqual(new Set(['key9']));
            expect(await backend.keys(JDB.Query.min('test'))).toEqual(new Set(['key0']));
        })().then(done, done.fail);
    });

    it('can process single entry combined queries', (done) => {
        (async function () {
            expect(await backend.keys(JDB.Query.and(JDB.Query.ge('test', 3), JDB.Query.lt('test', 5)))).toEqual(new Set(['key3', 'key4']));
            expect(await backend.keys(JDB.Query.or(JDB.Query.within('test', 1, 2), JDB.Query.ge('test', 7)))).toEqual(new Set(['key1', 'key2', 'key7', 'key8', 'key9']));
            expect(await backend.keys(JDB.Query.or(JDB.Query.within('test', 1, 2), JDB.Query.and(JDB.Query.ge('test', 7), JDB.Query.lt('test', 9))))).toEqual(new Set(['key1', 'key2', 'key7', 'key8']));
        })().then(done, done.fail);
    });

    it('can process multi entry range queries', (done) => {
        (async function () {
            expect(await backend.keys(JDB.Query.eq('multi', 3))).toEqual(new Set(['key3']));
            expect(await backend.keys(JDB.Query.eq('multi', 1))).toEqual(new Set(['key1', 'key3', 'key5', 'key7', 'key9']));
        })().then(done, done.fail);
    });

    it('can process multi entry min/max queries', (done) => {
        (async function () {
            expect(await backend.keys(JDB.Query.min('multi'))).toEqual(new Set(['key0', 'key2', 'key4', 'key6', 'key8']));
            expect(await backend.keys(JDB.Query.max('multi'))).toEqual(new Set(['key9']));
        })().then(done, done.fail);
    });

    it('can process queries over multiple indices', (done) => {
        (async function () {
            expect(await backend.keys(JDB.Query.or(JDB.Query.eq('test', 2), JDB.Query.eq('multi', 1)))).toEqual(new Set(['key1', 'key2', 'key3', 'key5', 'key7', 'key9']));
            expect(await backend.keys(JDB.Query.and(JDB.Query.max('test'), JDB.Query.eq('multi', 1)))).toEqual(new Set(['key9']));
            expect(await backend.keys(JDB.Query.and(JDB.Query.min('test'), JDB.Query.min('multi')))).toEqual(new Set(['key0']));
        })().then(done, done.fail);
    });
});
