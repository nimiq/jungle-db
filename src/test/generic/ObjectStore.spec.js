describe('Query', () => {
    let backend, objectStore;

    const setEqual = function(actual, expected) {
        return expected.equals(actual);
    };

    beforeEach((done) => {
        backend = new DummyBackend();

        objectStore = new ObjectStore(backend, backend);

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

    it('can open a transaction and commit it', (done) => {
        (async function () {
            const tx = objectStore.transaction();
            await tx.remove('key0');
            await tx.put('newKey', 'test');
            expect(await tx.commit()).toBe(true);
            expect(tx.state).toBe(Transaction.STATE.COMMITTED);
            expect(await objectStore.get('key0')).toBe(undefined);
            expect(await objectStore.get('newKey')).toBe('test');
        })().then(done, done.fail);
    });

    it('can only commit one transaction and ensures read isolation', (done) => {
        (async function () {
            // Create two transactions on the main state.
            const tx1 = objectStore.transaction();
            const tx2 = objectStore.transaction();
            // Remove a key in one of those.
            await tx1.remove('key0');
            // Ensure read isolation.
            expect(await tx1.get('key0')).toBe(undefined);
            expect(await tx2.get('key0')).not.toBe(undefined);

            // Commit one transaction.
            expect(await tx1.commit()).toBe(true);
            expect(tx1.state).toBe(Transaction.STATE.COMMITTED);

            // Still ensure read isolation.
            expect(await tx1.get('key0')).toBe(undefined);
            expect(await tx2.get('key0')).not.toBe(undefined);

            // Create a third transaction, which should be based on tx1.
            const tx3 = objectStore.transaction();
            expect(await tx3.get('key0')).toBe(undefined);
            expect(await backend.get('key0')).not.toBe(undefined); // not yet written

            // Should not be able to commit tx2.
            expect(await tx2.commit()).toBe(false);
            expect(tx2.state).toBe(Transaction.STATE.CONFLICTED);
            expect(await backend.get('key0')).not.toBe(undefined); // not yet written

            // Abort third transaction.
            expect(await tx3.abort()).toBe(true);

            // Now tx1 should be in the backend.
            expect(await backend.get('key0')).toBe(undefined);
            expect(await objectStore.get('key0')).toBe(undefined);
        })().then(done, done.fail);
    });
});
