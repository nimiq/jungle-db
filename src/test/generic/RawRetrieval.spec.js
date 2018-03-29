describe('RawRetrieval', () => {
    async function fill(store) {
        for (let i = 0; i < 10; i++) {
            await store.put(`key${i}`, {key: `key${i}`, value: i});
        }
    }

    const backends = [
        TestRunner.nativeRunner('test', 1, jdb => jdb.createObjectStore('testStore', {codec: TestCodec.instance, enableLruCache: false}), fill, 'without-cache'),
        TestRunner.volatileRunner(() => JungleDB.createVolatileObjectStore(TestCodec.instance), fill),
        TestRunner.nativeRunner('test', 1, jdb => jdb.createObjectStore('testStore', {codec: TestCodec.instance, enableLruCache: true}), fill, 'with-value-cache'),
        TestRunner.nativeRunner('test', 1, jdb => jdb.createObjectStore('testStore', {codec: TestCodec.instance, enableLruCache: true, rawLruCacheSize: 100}), fill, 'with-raw-cache')
    ];

    backends.forEach(/** @type {TestRunner} */ runner => {

        it(`can retrieve raw and decoded values from store (${runner.type})`, (done) => {
            (async function () {
                const objectStore = await runner.init();
                
                expect(await objectStore.get('key2')).toEqual({key: 'key2', value: 2});
                expect(await objectStore.get('key2', {raw: true})).toEqual({k: 'key2', v: 2});

                // Potentially also from cache
                expect(await objectStore.get('key2')).toEqual({key: 'key2', value: 2});
                expect(await objectStore.get('key2', {raw: true})).toEqual({k: 'key2', v: 2});

                await objectStore.put('test', {key: 'test', value: 1337});
                expect(await objectStore.get('test')).toEqual({key: 'test', value: 1337});
                expect(await objectStore.get('test', {raw: true})).toEqual({k: 'test', v: 1337});
                
                await runner.destroy();
            })().then(done, done.fail);
        });

        it(`can retrieve raw and decoded values from transaction (${runner.type})`, (done) => {
            (async function () {
                const objectStore = await runner.init();

                const tx = objectStore.transaction();
                expect(await tx.get('key2')).toEqual({key: 'key2', value: 2});
                expect(await tx.get('key2', {raw: true})).toEqual({k: 'key2', v: 2});

                tx.putSync('test', {key: 'test', value: 1337});
                expect(await tx.get('test')).toEqual({key: 'test', value: 1337});
                expect(await tx.get('test', {raw: true})).toEqual({k: 'test', v: 1337});

                await tx.commit();

                expect(await objectStore.get('test')).toEqual({key: 'test', value: 1337});
                expect(await objectStore.get('test', {raw: true})).toEqual({k: 'test', v: 1337});

                await runner.destroy();
            })().then(done, done.fail);
        });

        it(`can retrieve raw and decoded values from synchronous transaction (${runner.type})`, (done) => {
            (async function () {
                const objectStore = await runner.init();

                const tx = objectStore.synchronousTransaction();
                await tx.preload(['key2']);

                expect(tx.getSync('key2')).toEqual({key: 'key2', value: 2});
                expect(tx.getSync('key2', {raw: true})).toEqual({k: 'key2', v: 2});

                tx.putSync('test', {key: 'test', value: 1337});
                expect(tx.getSync('test')).toEqual({key: 'test', value: 1337});
                expect(tx.getSync('test', {raw: true})).toEqual({k: 'test', v: 1337});

                await tx.commit();

                expect(await objectStore.get('test')).toEqual({key: 'test', value: 1337});
                expect(await objectStore.get('test', {raw: true})).toEqual({k: 'test', v: 1337});

                await runner.destroy();
            })().then(done, done.fail);
        });
    });
});
