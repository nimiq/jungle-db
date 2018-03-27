describe('TestCodec', () => {
    let backend, objectStore;

    const setEqual = function(actual, expected) {
        return expected.equals(actual);
    };

    const valuefy = function(obj) {
        const mapFn = value => value.value;
        if (obj === undefined) {
            return obj;
        }
        if (obj instanceof Array) {
            return obj.map(mapFn);
        }
        if (obj instanceof Set) {
            return new Set(Array.from(obj.values(), mapFn));
        }
        return mapFn(obj);
    };

    const expectvaluefy = function(obj) {
        return expect(valuefy(obj));
    };

    const objfy = function(key, value) {
        return { key: key, value: value };
    };

    beforeEach((done) => {
        backend = new InMemoryBackend('', TestCodec.instance);

        objectStore = new ObjectStore(backend, backend);

        (async function () {
            // Add 10 objects.
            for (let i=0; i<10; ++i) {
                await backend.put(`key${i}`, objfy(`key${i}`, `value${i}`));
            }
        })().then(done, done.fail);

        jasmine.addCustomEqualityTester(setEqual);
    });

    it('can open a transaction and commit it', (done) => {
        (async function () {
            const tx = objectStore.transaction();
            await tx.remove('key0');
            await tx.put('newKey', objfy('newKey', 'test'));
            expect(await tx.commit()).toBe(true);
            expect(tx.state).toBe(Transaction.STATE.COMMITTED);
            expectvaluefy(await objectStore.get('key0')).toBe(undefined);
            expectvaluefy(await objectStore.get('newKey')).toBe('test');
        })().then(done, done.fail);
    });

    it('can only commit one transaction and ensures read isolation', (done) => {
        (async function () {
            // Create two transactions on the main state.
            const tx1 = objectStore.transaction();
            // Remove a key in one of those.
            await tx1.remove('key0');
            await tx1.put('test', objfy('test', 'success'));
            await tx1.put('key1', objfy('key1', 'someval'));

            const tx2 = objectStore.transaction();
            // Ensure read isolation.
            expectvaluefy(await tx1.get('key0')).toBe(undefined);
            expectvaluefy(await tx2.get('key0')).toBe('value0');
            expectvaluefy(await tx1.get('test')).toBe('success');
            expectvaluefy(await tx2.get('test')).toBe(undefined);
            expectvaluefy(await tx1.get('key1')).toBe('someval');
            expectvaluefy(await tx2.get('key1')).toBe('value1');

            // Commit one transaction.
            expect(await tx1.commit()).toBe(true);
            expect(tx1.state).toBe(Transaction.STATE.COMMITTED);

            // Still ensure read isolation.
            expectvaluefy(await tx1.get('key0')).toBe(undefined);
            expectvaluefy(await tx2.get('key0')).toBe('value0');
            expectvaluefy(await tx1.get('test')).toBe('success');
            expectvaluefy(await tx2.get('test')).toBe(undefined);
            expectvaluefy(await tx1.get('key1')).toBe('someval');
            expectvaluefy(await tx2.get('key1')).toBe('value1');

            // Create a third transaction, which should be based on tx1.
            const tx3 = objectStore.transaction();
            expectvaluefy(await tx3.get('key0')).toBe(undefined);
            expectvaluefy(await tx3.get('test')).toBe('success');
            expectvaluefy(await tx3.get('key1')).toBe('someval');
            expectvaluefy(await backend.get('key0')).toBe('value0'); // not yet written
            expectvaluefy(await backend.get('test')).toBe(undefined); // not yet written
            expectvaluefy(await backend.get('key1')).toBe('value1'); // not yet written

            // More changes
            await tx3.remove('key2');
            await tx3.put('test', objfy('test', 'success2'));
            await tx3.put('key0', objfy('key0', 'someval'));

            // Still ensure read isolation.
            expectvaluefy(await tx1.get('key0')).toBe(undefined);
            expectvaluefy(await tx3.get('key0')).toBe('someval');
            expectvaluefy(await tx1.get('test')).toBe('success');
            expectvaluefy(await tx3.get('test')).toBe('success2');
            expectvaluefy(await tx1.get('key1')).toBe('someval');
            expectvaluefy(await tx3.get('key1')).toBe('someval');
            expectvaluefy(await tx1.get('key2')).toBe('value2');
            expectvaluefy(await tx3.get('key2')).toBe(undefined);

            // Commit third transaction.
            expect(await tx3.commit()).toBe(true);
            expect(tx3.state).toBe(Transaction.STATE.COMMITTED);

            // Create a fourth transaction, which should be based on tx3.
            const tx4 = objectStore.transaction();
            expectvaluefy(await tx4.get('key0')).toBe('someval');
            expectvaluefy(await tx4.get('test')).toBe('success2');
            expectvaluefy(await tx4.get('key1')).toBe('someval');
            expectvaluefy(await tx4.get('key2')).toBe(undefined);
            expectvaluefy(await backend.get('key0')).toBe('value0'); // not yet written
            expectvaluefy(await backend.get('test')).toBe(undefined); // not yet written
            expectvaluefy(await backend.get('key1')).toBe('value1'); // not yet written
            expectvaluefy(await backend.get('key2')).toBe('value2'); // not yet written

            // Abort second transaction and commit empty fourth transaction.
            expect(await tx2.abort()).toBe(true);
            expect(await tx4.commit()).toBe(true);
            expect(tx4.state).toBe(Transaction.STATE.COMMITTED);

            // Now everything should be in the backend.
            expectvaluefy(await backend.get('key0')).toBe('someval');
            expectvaluefy(await objectStore.get('key0')).toBe('someval');
            expectvaluefy(await backend.get('test')).toBe('success2');
            expectvaluefy(await objectStore.get('test')).toBe('success2');
            expectvaluefy(await backend.get('key1')).toBe('someval');
            expectvaluefy(await objectStore.get('key1')).toBe('someval');
            expectvaluefy(await backend.get('key2')).toBe(undefined);
            expectvaluefy(await objectStore.get('key2')).toBe(undefined);

            // Create a fifth transaction, which should be based on the new state.
            const tx5 = objectStore.transaction();
            expectvaluefy(await tx5.get('key0')).toBe('someval');
            expectvaluefy(await tx5.get('test')).toBe('success2');
            expectvaluefy(await tx5.get('key1')).toBe('someval');
            expectvaluefy(await tx5.get('key2')).toBe(undefined);
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
            expectvaluefy(await tx2.get('key0')).toBe('value0');

            // Commit one transaction.
            expect(await tx1.commit()).toBe(true);
            expect(tx1.state).toBe(Transaction.STATE.COMMITTED);

            // Still ensure read isolation.
            expect(await tx1.get('key0')).toBe(undefined);
            expectvaluefy(await tx2.get('key0')).toBe('value0');

            // Create a third transaction, which should be based on tx1.
            const tx3 = objectStore.transaction();
            await tx3.put('test', objfy('test', 'successful'));
            expect(await tx3.get('key0')).toBe(undefined);
            expectvaluefy(await backend.get('key0')).toBe('value0'); // not yet written

            // Should not be able to commit tx2.
            expect(await tx2.commit()).toBe(false);
            expect(tx2.state).toBe(Transaction.STATE.CONFLICTED);

            // tx1 might be flushed by now. No more transactions possible on top of it.
            try {
                tx1.transaction();
                expect(true).toBe(false);
            } catch (e) {
                expect(true).toBe(true);
            }

            // Create another transaction, which should be based on the same backend as tx3.
            const tx4 = objectStore.transaction();
            expect(tx3._parent).toBe(tx4._parent);
            expect(await tx4.get('key0')).toBe(undefined);
            expect(await tx4.get('test')).toBe(undefined);

            // Abort third transaction.
            expect(await tx3.commit()).toBe(true);
            expect(await tx4.commit()).toBe(false);

            // Now tx1 should be in the backend.
            expect(await backend.get('key0')).toBe(undefined);
            expect(await objectStore.get('key0')).toBe(undefined);
            // As well as tx3.
            expectvaluefy(await backend.get('test')).toBe('successful');
            expectvaluefy(await objectStore.get('test')).toBe('successful');

            // Create a fourth transaction, which should be based on the new state.
            const tx5 = objectStore.transaction();
            expect(await tx5.get('key0')).toBe(undefined);
            expectvaluefy(await tx5.get('test')).toBe('successful');
            await tx5.abort();
        })().then(done, done.fail);
    });
});
