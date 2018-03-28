describe('Transaction', () => {
    let jdb, objectStore, tx, allKeys, allValues;

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
        jdb = new JungleDB('test', 1);
        objectStore = jdb.createObjectStore('testStore');
        objectStore.createIndex('i', 'i', { keyEncoding: JungleDB.NUMBER_ENCODING });

        allKeys = new Set();
        allValues = new Set();

        (async function () {
            await jdb.connect();

            // Add 10 objects.
            for (let i=0; i<10; ++i) {
                await objectStore.put(`key${i}`, { i: i, sub: `value${i}` });
                if (i > 0 && i < 5) {
                    allKeys.add(`key${i}`);
                    allValues.add(`value${i}`);
                }
            }

            tx = objectStore.transaction();

            for (let i=5; i<15; ++i) {
                await tx.put(`key${i}`, { i: i, sub: `newValue${i}` });
                allKeys.add(`key${i}`);
                allValues.add(`newValue${i}`);
            }

            await tx.remove('key0');
        })().then(done, done.fail);

        jasmine.addCustomEqualityTester(setEqual);
    });

    afterEach((done) => {
        jdb.destroy().then(done, done.fail);
    });

    it('correctly processes keys/values queries', (done) => {
        (async function () {
            // Ordering on strings might not be as expected!
            expect(await tx.keys()).toEqual(allKeys);
            expect(await tx.keys(KeyRange.upperBound('key5'))).toEqual(new Set(['key1', 'key2', 'key3', 'key4', 'key5', 'key10', 'key11', 'key12', 'key13', 'key14']));
            expect(await tx.keys(KeyRange.lowerBound('key1', true))).toEqual(allKeys.difference(['key1']));
            expect(await tx.keys(KeyRange.lowerBound('key5', true))).toEqual(new Set(['key6', 'key7', 'key8', 'key9']));

            expect(subValue(await tx.values())).toEqual(allValues);
        })().then(done, done.fail);
    });

    it('correctly processes min/max queries', (done) => {
        (async function () {
            expect(await tx.minKey()).toBe('key1');
            expect(await tx.maxKey()).toBe('key9');
            expect(await tx.minKey(KeyRange.upperBound('key5'))).toBe('key1');
            expect(await tx.minKey(KeyRange.lowerBound('key1', true))).toBe('key10');
            expect(await tx.minKey(KeyRange.lowerBound('key5', true))).toBe('key6');

            expect((await tx.minValue()).sub).toBe('value1');
            expect((await tx.maxValue()).sub).toBe('newValue9');
            expect((await tx.minValue(KeyRange.upperBound('key5'))).sub).toBe('value1');
            expect((await tx.minValue(KeyRange.lowerBound('key1', true))).sub).toBe('newValue10');
            expect((await tx.minValue(KeyRange.lowerBound('key5', true))).sub).toBe('newValue6');
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
                expect(true).toBe(true);
            }

            try {
                await tx.remove('test');
                done.fail('did not throw');
            } catch (e) {
                // all ok
                expect(true).toBe(true);
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
                expect(true).toBe(true);
            }

            try {
                await tx.remove('test');
                done.fail('did not throw');
            } catch (e) {
                // all ok
                expect(true).toBe(true);
            }
        })().then(done, done.fail);
    });

    it('correctly processes min/max index queries', (done) => {
        (async function () {
            const index = tx.index('i');
            expect(await index.minKeys()).toEqual(new Set(['key1']));
            expect(await index.maxKeys()).toEqual(new Set(['key14']));
            expect(await index.minKeys(KeyRange.upperBound(5))).toEqual(new Set(['key1']));
            expect(await index.minKeys(KeyRange.lowerBound(1, true))).toEqual(new Set(['key2']));
            expect(await index.minKeys(KeyRange.lowerBound(5, true))).toEqual(new Set(['key6']));

            expect(subValue(await index.minValues())).toEqual(new Set(['value1']));
            expect(subValue(await index.maxValues())).toEqual(new Set(['newValue14']));
            expect(subValue(await index.minValues(KeyRange.upperBound(5)))).toEqual(new Set(['value1']));
            expect(subValue(await index.minValues(KeyRange.lowerBound(1, true)))).toEqual(new Set(['value2']));
            expect(subValue(await index.minValues(KeyRange.lowerBound(5, true)))).toEqual(new Set(['newValue6']));
        })().then(done, done.fail);
    });

    it('does not allow changing nested transactions', (done) => {
        (async function () {
            const tx1 = tx.transaction();

            // Should not be able to remove a key in the outer transaction.
            try {
                await tx.remove('key0');
                done.fail('did not throw when changing outer tx');
            } catch (e) {
                // all ok
                expect(true).toBe(true);
            }
        })().then(done, done.fail);
    });

    it('does apply nested transactions', (done) => {
        (async function () {
            const tx1 = tx.transaction();

            await tx1.put('test', 'foobar');
            expect(await tx.get('test')).toBeUndefined();
            expect(await tx1.commit()).toBe(true);
            expect(await tx.get('test')).toBe('foobar');
        })().then(done, done.fail);
    });

    it('does apply nested synchronous transactions', (done) => {
        (async function () {
            const tx1 = tx.synchronousTransaction();

            tx1.putSync('test', 'foobar');
            expect(await tx.get('test')).toBeUndefined();
            expect(await tx1.commit()).toBe(true);
            expect(await tx.get('test')).toBe('foobar');
        })().then(done, done.fail);
    });

    it('correctly constructs key streams', (done) => {
        (async function () {
            const keys = Array.from(allKeys).sort();
            let i = 0;
            await tx.keyStream(key => {
                expect(key).toBe(keys[i]);
                ++i;
                return true;
            });
            expect(i).toBe(14);
            --i;

            await tx.keyStream(key => {
                expect(key).toBe(keys[i]);
                --i;
                return true;
            }, false);
            expect(i).toBe(-1);

            i = 6;
            await tx.keyStream(key => {
                expect(key).toBe(`key${i}`);
                --i;
                return true;
            }, false, KeyRange.bound('key3', 'key6'));
            expect(i).toBe(2);

            i = 5;
            await tx.keyStream(key => {
                expect(key).toBe(`key${i}`);
                ++i;
                return i < 7;
            }, true, KeyRange.lowerBound('key4', true));
            expect(i).toBe(7);
        })().then(done, done.fail);
    });

    it('correctly constructs value streams', (done) => {
        (async function () {
            const keys = Array.from(allKeys).sort();
            let i = 0;
            await tx.valueStream((value, key) => {
                const val = parseInt(keys[i].substr(3));
                expect(value.sub).toBe(val >= 5 ? `newValue${val}` : `value${val}`);
                expect(key).toBe(keys[i]);
                ++i;
                return true;
            });
            expect(i).toBe(14);
            --i;

            await tx.valueStream((value, key) => {
                const val = parseInt(keys[i].substr(3));
                expect(value.sub).toBe(val >= 5 ? `newValue${val}` : `value${val}`);
                expect(key).toBe(keys[i]);
                --i;
                return true;
            }, false);
            expect(i).toBe(-1);

            i = 6;
            await tx.valueStream((value, key) => {
                expect(value.sub).toBe(i >= 5 ? `newValue${i}` : `value${i}`);
                expect(key).toBe(`key${i}`);
                --i;
                return true;
            }, false, KeyRange.bound('key3', 'key6'));
            expect(i).toBe(2);

            i = 5;
            await tx.valueStream((value, key) => {
                expect(value.sub).toBe(i >= 5 ? `newValue${i}` : `value${i}`);
                expect(key).toBe(`key${i}`);
                ++i;
                return i < 7;
            }, true, KeyRange.lowerBound('key4', true));
            expect(i).toBe(7);
        })().then(done, done.fail);
    });
});
