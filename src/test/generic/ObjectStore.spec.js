describe('ObjectStore', () => {
    let backend, objectStore;

    const setEqual = function(actual, expected) {
        return expected.equals(actual);
    };

    beforeEach((done) => {
        backend = new DummyBackend();

        objectStore = new JDB.ObjectStore(backend, backend);

        (async function () {
            // Add 10 objects.
            for (let i=0; i<10; ++i) {
                await backend.put(`key${i}`, `value${i}`);
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
            expect(tx.state).toBe(JDB.Transaction.STATE.COMMITTED);
            expect(await objectStore.get('key0')).toBe(undefined);
            expect(await objectStore.get('newKey')).toBe('test');
        })().then(done, done.fail);
    });

    it('can only commit one transaction and ensures read isolation', (done) => {
        (async function () {
            // Create two transactions on the main state.
            const tx1 = objectStore.transaction();
            // Remove a key in one of those.
            await tx1.remove('key0');
            await tx1.put('test', 'success');
            await tx1.put('key1', 'someval');

            const tx2 = objectStore.transaction();
            // Ensure read isolation.
            expect(await tx1.get('key0')).toBe(undefined);
            expect(await tx2.get('key0')).toBe('value0');
            expect(await tx1.get('test')).toBe('success');
            expect(await tx2.get('test')).toBe(undefined);
            expect(await tx1.get('key1')).toBe('someval');
            expect(await tx2.get('key1')).toBe('value1');

            // Commit one transaction.
            expect(await tx1.commit()).toBe(true);
            expect(tx1.state).toBe(JDB.Transaction.STATE.COMMITTED);

            // Still ensure read isolation.
            expect(await tx1.get('key0')).toBe(undefined);
            expect(await tx2.get('key0')).toBe('value0');
            expect(await tx1.get('test')).toBe('success');
            expect(await tx2.get('test')).toBe(undefined);
            expect(await tx1.get('key1')).toBe('someval');
            expect(await tx2.get('key1')).toBe('value1');

            // Create a third transaction, which should be based on tx1.
            const tx3 = objectStore.transaction();
            expect(await tx3.get('key0')).toBe(undefined);
            expect(await tx3.get('test')).toBe('success');
            expect(await tx3.get('key1')).toBe('someval');
            expect(await backend.get('key0')).toBe('value0'); // not yet written
            expect(await backend.get('test')).toBe(undefined); // not yet written
            expect(await backend.get('key1')).toBe('value1'); // not yet written

            // More changes
            await tx3.remove('key2');
            await tx3.put('test', 'success2');
            await tx3.put('key0', 'someval');

            // Still ensure read isolation.
            expect(await tx1.get('key0')).toBe(undefined);
            expect(await tx3.get('key0')).toBe('someval');
            expect(await tx1.get('test')).toBe('success');
            expect(await tx3.get('test')).toBe('success2');
            expect(await tx1.get('key1')).toBe('someval');
            expect(await tx3.get('key1')).toBe('someval');
            expect(await tx1.get('key2')).toBe('value2');
            expect(await tx3.get('key2')).toBe(undefined);

            // Commit third transaction.
            expect(await tx3.commit()).toBe(true);
            expect(tx3.state).toBe(JDB.Transaction.STATE.COMMITTED);

            // Create a fourth transaction, which should be based on tx3.
            const tx4 = objectStore.transaction();
            expect(await tx4.get('key0')).toBe('someval');
            expect(await tx4.get('test')).toBe('success2');
            expect(await tx4.get('key1')).toBe('someval');
            expect(await tx4.get('key2')).toBe(undefined);
            expect(await backend.get('key0')).toBe('value0'); // not yet written
            expect(await backend.get('test')).toBe(undefined); // not yet written
            expect(await backend.get('key1')).toBe('value1'); // not yet written
            expect(await backend.get('key2')).toBe('value2'); // not yet written

            // Abort second transaction and commit empty fourth transaction.
            expect(await tx2.abort()).toBe(true);
            expect(await tx4.commit()).toBe(true);
            expect(tx4.state).toBe(JDB.Transaction.STATE.COMMITTED);

            // Now everything should be in the backend.
            expect(await backend.get('key0')).toBe('someval');
            expect(await objectStore.get('key0')).toBe('someval');
            expect(await backend.get('test')).toBe('success2');
            expect(await objectStore.get('test')).toBe('success2');
            expect(await backend.get('key1')).toBe('someval');
            expect(await objectStore.get('key1')).toBe('someval');
            expect(await backend.get('key2')).toBe(undefined);
            expect(await objectStore.get('key2')).toBe(undefined);

            // Create a fifth transaction, which should be based on the new state.
            const tx5 = objectStore.transaction();
            expect(await tx5.get('key0')).toBe('someval');
            expect(await tx5.get('test')).toBe('success2');
            expect(await tx5.get('key1')).toBe('someval');
            expect(await tx5.get('key2')).toBe(undefined);
            await tx5.abort();
        })().then(done, done.fail);
    });

    it('can correctly handle multi-layered transactions', (done) => {
        (async function () {
            // Create two transactions on the main state.
            const tx1 = objectStore.transaction();
            const tx2 = objectStore.transaction();
            // Remove a key in one of those.
            await tx1.remove('key0');
            // Ensure read isolation.
            expect(await tx1.get('key0')).toBe(undefined);
            expect(await tx2.get('key0')).toBe('value0');

            // Commit one transaction.
            expect(await tx1.commit()).toBe(true);
            expect(tx1.state).toBe(JDB.Transaction.STATE.COMMITTED);

            // Still ensure read isolation.
            expect(await tx1.get('key0')).toBe(undefined);
            expect(await tx2.get('key0')).toBe('value0');

            // Create a third transaction, which should be based on tx1.
            const tx3 = objectStore.transaction();
            await tx3.put('test', 'successful');
            expect(await tx3.get('key0')).toBe(undefined);
            expect(await backend.get('key0')).toBe('value0'); // not yet written

            // Should not be able to commit tx2.
            expect(await tx2.commit()).toBe(false);
            expect(tx2.state).toBe(JDB.Transaction.STATE.CONFLICTED);

            // tx1 might be flushed by now. No more transactions possible on top of it.
            try {
                tx1.transaction();
                expect(true).toBe(false);
            } catch (e) {
                expect(true).toBe(true);
            }

            // Create another transaction, which should be based on the same backend as tx3.
            const tx4 = objectStore.transaction();
            expect(tx3.__backend).toBe(tx4.__backend);
            expect(await tx4.get('key0')).toBe(undefined);
            expect(await tx4.get('test')).toBe(undefined);

            // Abort third transaction.
            expect(await tx3.commit()).toBe(true);
            expect(await tx4.commit()).toBe(false);

            // Now tx1 should be in the backend.
            expect(await backend.get('key0')).toBe(undefined);
            expect(await objectStore.get('key0')).toBe(undefined);
            // As well as tx3.
            expect(await backend.get('test')).toBe('successful');
            expect(await objectStore.get('test')).toBe('successful');

            // Create a fourth transaction, which should be based on the new state.
            const tx5 = objectStore.transaction();
            expect(await tx5.get('key0')).toBe(undefined);
            expect(await tx5.get('test')).toBe('successful');
            await tx5.abort();
        })().then(done, done.fail);
    });

    it('does not allow to commit transactions with nested sub-transactions', (done) => {
        (async function () {
            // Create two transactions on the main state.
            const tx1 = objectStore.transaction();
            expect(tx1.state).toBe(JDB.Transaction.STATE.OPEN);
            const tx2 = tx1.transaction();
            expect(tx1.state).toBe(JDB.Transaction.STATE.NESTED);
            expect(tx2.state).toBe(JDB.Transaction.STATE.OPEN);
            const tx3 = tx2.transaction();
            expect(tx2.state).toBe(JDB.Transaction.STATE.NESTED);
            expect(tx3.state).toBe(JDB.Transaction.STATE.OPEN);
            const tx4 = tx2.transaction();
            expect(tx2.state).toBe(JDB.Transaction.STATE.NESTED);
            expect(tx4.state).toBe(JDB.Transaction.STATE.OPEN);

            // Should not be able to commit.
            try {
                await tx1.commit();
                done.fail('did not throw when committing outer tx');
            } catch (e) {
                // all ok
            }

            // Should not be able to commit.
            try {
                await tx2.commit();
                done.fail('did not throw when committing middle tx');
            } catch (e) {
                // all ok
            }

            expect(tx1.state).toBe(JDB.Transaction.STATE.NESTED);
            expect(tx2.state).toBe(JDB.Transaction.STATE.NESTED);
            expect(tx3.state).toBe(JDB.Transaction.STATE.OPEN);
            expect(tx4.state).toBe(JDB.Transaction.STATE.OPEN);

            expect(await tx3.commit()).toBe(true);
            expect(tx1.state).toBe(JDB.Transaction.STATE.NESTED);
            expect(tx2.state).toBe(JDB.Transaction.STATE.NESTED);
            expect(tx3.state).toBe(JDB.Transaction.STATE.COMMITTED);
            expect(tx4.state).toBe(JDB.Transaction.STATE.OPEN);

            expect(await tx4.commit()).toBe(false);
            expect(tx1.state).toBe(JDB.Transaction.STATE.NESTED);
            expect(tx2.state).toBe(JDB.Transaction.STATE.OPEN);
            expect(tx3.state).toBe(JDB.Transaction.STATE.COMMITTED);
            expect(tx4.state).toBe(JDB.Transaction.STATE.CONFLICTED);

            expect(await tx2.commit()).toBe(true);
            expect(tx1.state).toBe(JDB.Transaction.STATE.OPEN);
            expect(tx2.state).toBe(JDB.Transaction.STATE.COMMITTED);
            expect(tx3.state).toBe(JDB.Transaction.STATE.COMMITTED);
            expect(tx4.state).toBe(JDB.Transaction.STATE.CONFLICTED);

            expect(await tx1.abort()).toBe(true);
            expect(tx1.state).toBe(JDB.Transaction.STATE.ABORTED);
            expect(tx2.state).toBe(JDB.Transaction.STATE.COMMITTED);
            expect(tx3.state).toBe(JDB.Transaction.STATE.COMMITTED);
            expect(tx4.state).toBe(JDB.Transaction.STATE.CONFLICTED);
        })().then(done, done.fail);
    });

    it('aborts nested transactions on outer abort', (done) => {
        (async function () {
            // Create two transactions on the main state.
            const tx1 = objectStore.transaction();
            expect(tx1.state).toBe(JDB.Transaction.STATE.OPEN);
            const tx2 = tx1.transaction();
            expect(tx1.state).toBe(JDB.Transaction.STATE.NESTED);
            expect(tx2.state).toBe(JDB.Transaction.STATE.OPEN);
            const tx3 = tx2.transaction();
            expect(tx2.state).toBe(JDB.Transaction.STATE.NESTED);
            expect(tx3.state).toBe(JDB.Transaction.STATE.OPEN);
            const tx4 = tx2.transaction();
            expect(tx2.state).toBe(JDB.Transaction.STATE.NESTED);
            expect(tx4.state).toBe(JDB.Transaction.STATE.OPEN);

            await tx1.abort();
            expect(tx1.state).toBe(JDB.Transaction.STATE.ABORTED);
            expect(tx2.state).toBe(JDB.Transaction.STATE.ABORTED);
            expect(tx3.state).toBe(JDB.Transaction.STATE.ABORTED);
            expect(tx4.state).toBe(JDB.Transaction.STATE.ABORTED);
        })().then(done, done.fail);
    });
});
