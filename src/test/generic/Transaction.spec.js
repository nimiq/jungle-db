describe('Transaction', () => {
    let backend, tx, allKeys, allValues;

    const setEqual = function(actual, expected) {
        return expected.equals(actual);
    };

    function subValue(result) {
        const subResult = new Set();
        if (result) {
            for (const v of result) {
                subResult.add(v.sub);
            }
        }
        return subResult;
    }

    beforeEach((done) => {
        backend = new DummyBackend();
        allKeys = new Set();
        allValues = new Set();

        (async function () {
            await backend.createIndex('i');
            tx = new JDB.Transaction(backend, backend, false);

            // Add 10 objects.
            for (let i=0; i<10; ++i) {
                await backend.put(`key${i}`, { i: i, sub: `value${i}` });
                if (i > 0 && i < 5) {
                    allKeys.add(`key${i}`);
                    allValues.add(`value${i}`);
                }
            }

            for (let i=5; i<15; ++i) {
                await tx.put(`key${i}`, { i: i, sub: `newValue${i}` });
                allKeys.add(`key${i}`);
                allValues.add(`newValue${i}`);
            }

            await tx.remove('key0');
        })().then(done, done.fail);

        jasmine.addCustomEqualityTester(setEqual);
    });

    it('correctly processes keys/values queries', (done) => {
        (async function () {
            // Ordering on strings might not be as expected!
            expect(await tx.keys()).toEqual(allKeys);
            expect(await tx.keys(JDB.KeyRange.upperBound('key5'))).toEqual(new Set(['key1', 'key2', 'key3', 'key4', 'key5', 'key10', 'key11', 'key12', 'key13', 'key14']));
            expect(await tx.keys(JDB.KeyRange.lowerBound('key1', true))).toEqual(allKeys.difference(['key1']));
            expect(await tx.keys(JDB.KeyRange.lowerBound('key5', true))).toEqual(new Set(['key6', 'key7', 'key8', 'key9']));

            expect(subValue(await tx.values())).toEqual(allValues);
        })().then(done, done.fail);
    });

    it('correctly processes min/max queries', (done) => {
        (async function () {
            expect(await tx.minKey()).toBe('key1');
            expect(await tx.maxKey()).toBe('key9');
            expect(await tx.minKey(JDB.KeyRange.upperBound('key5'))).toBe('key1');
            expect(await tx.minKey(JDB.KeyRange.lowerBound('key1', true))).toBe('key10');
            expect(await tx.minKey(JDB.KeyRange.lowerBound('key5', true))).toBe('key6');

            expect((await tx.minValue()).sub).toBe('value1');
            expect((await tx.maxValue()).sub).toBe('newValue9');
            expect((await tx.minValue(JDB.KeyRange.upperBound('key5'))).sub).toBe('value1');
            expect((await tx.minValue(JDB.KeyRange.lowerBound('key1', true))).sub).toBe('newValue10');
            expect((await tx.minValue(JDB.KeyRange.lowerBound('key5', true))).sub).toBe('newValue6');
        })().then(done, done.fail);
    });

    it('does not allow changes after abort', (done) => {
        (async function () {
            await tx.abort();

            try {
                await tx.put('test', 'fail');
                done.fail('did not throw');
            } catch (e) {
                // all ok
            }

            try {
                await tx.remove('test');
                done.fail('did not throw');
            } catch (e) {
                // all ok
            }
        })().then(done, done.fail);
    });

    it('does not allow changes after commit', (done) => {
        (async function () {
            await tx.commit();

            try {
                await tx.put('test', 'fail');
                done.fail('did not throw');
            } catch (e) {
                // all ok
            }

            try {
                await tx.remove('test');
                done.fail('did not throw');
            } catch (e) {
                // all ok
            }
        })().then(done, done.fail);
    });

    it('correctly processes min/max index queries', (done) => {
        (async function () {
            const index = tx.index('i');
            expect(await index.minKeys()).toEqual(new Set(['key1']));
            expect(await index.maxKeys()).toEqual(new Set(['key14']));
            expect(await index.minKeys(JDB.KeyRange.upperBound(5))).toEqual(new Set(['key1']));
            expect(await index.minKeys(JDB.KeyRange.lowerBound(1, true))).toEqual(new Set(['key2']));
            expect(await index.minKeys(JDB.KeyRange.lowerBound(5, true))).toEqual(new Set(['key6']));

            expect(subValue(await index.minValues())).toEqual(new Set(['value1']));
            expect(subValue(await index.maxValues())).toEqual(new Set(['newValue14']));
            expect(subValue(await index.minValues(JDB.KeyRange.upperBound(5)))).toEqual(new Set(['value1']));
            expect(subValue(await index.minValues(JDB.KeyRange.lowerBound(1, true)))).toEqual(new Set(['value2']));
            expect(subValue(await index.minValues(JDB.KeyRange.lowerBound(5, true)))).toEqual(new Set(['newValue6']));
        })().then(done, done.fail);
    });
});
