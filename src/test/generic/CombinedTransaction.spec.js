describe('CombinedTransaction', () => {
    let backend1, backend2, objectStore1, objectStore2;

    beforeEach((done) => {
        backend1 = new InMemoryBackend('');
        backend2 = new InMemoryBackend('');
        objectStore1 = new ObjectStore(backend1, null);
        objectStore2 = new ObjectStore(backend2, null);

        (async function () {
            // Add 10 objects.
            for (let i=0; i<10; ++i) {
                if (i < 8) {
                    await objectStore1.put(`key${i}`, `value${i}`);
                }
                if (i > 5) {
                    await objectStore2.put(`key${i}`, `value${i}`);
                }
            }
        })().then(done, done.fail);
    });

    it('commit/abort on individual transactions triggers combined commit/abort', (done) => {
        (async function () {
            let tx1 = objectStore1.transaction();
            let tx2 = objectStore2.transaction();
            await tx1.remove('key6');
            await tx2.remove('key6');
            new CombinedTransaction(tx1, tx2);

            expect(await tx1.commit()).toBe(true);
            expect(await tx2.state).toBe(Transaction.STATE.COMMITTED);
            expect(await backend1.get('key6')).toBe(undefined);
            expect(await backend2.get('key6')).toBe(undefined);

            tx1 = objectStore1.transaction();
            tx2 = objectStore2.transaction();
            await tx1.remove('key7');
            await tx2.remove('key7');
            new CombinedTransaction(tx1, tx2);

            expect(await tx2.abort()).toBe(true);
            expect(await tx1.state).toBe(Transaction.STATE.ABORTED);
            expect(await backend1.get('key7')).toBe('value7');
            expect(await backend2.get('key7')).toBe('value7');
        })().then(done, done.fail);
    });

    it('cannot commit combined transactions from same object store', (done) => {
        (async function () {
            const tx1 = objectStore1.transaction();
            const tx2 = objectStore1.transaction();
            await tx1.remove('key0');
            try {
                await JungleDB.commitCombined(tx1, tx2);
                expect(false).toBe(true);
            } catch (e) {
                expect(true).toBe(true);
            }
        })().then(done, done.fail);
    });

    it('scenario 1: instant flush', (done) => {
        (async function () {
            // Create two transactions in different object stores.
            const tx1 = objectStore1.transaction();
            const tx2 = objectStore2.transaction();
            await tx1.remove('key6');
            await tx2.remove('key6');

            // Commit both (which should immediately update the backend as well).
            expect(await JungleDB.commitCombined(tx1, tx2)).toBe(true);
            expect(await backend1.get('key6')).toBe(undefined);
            expect(await backend2.get('key6')).toBe(undefined);
        })().then(done, done.fail);
    });

    it('scenario 2: flush after abort', (done) => {
        (async function () {
            // Create three transactions in two object stores.
            const tx1 = objectStore1.transaction();
            const tx2 = objectStore2.transaction();
            const tx3 = objectStore2.transaction();
            await tx1.remove('key6');
            await tx2.remove('key6');

            // Commit two of them, which should be successful.
            expect(await JungleDB.commitCombined(tx1, tx2)).toBe(true);
            // Hence the object store will be updated.
            expect(await objectStore1.get('key6')).toBe(undefined);
            expect(await objectStore2.get('key6')).toBe(undefined);
            // But tx3 should not allow to flush to the backend.
            expect(await backend1.get('key6')).toBe('value6');
            expect(await backend2.get('key6')).toBe('value6');

            // Commit tx3 (which should fail) and expect flushed combined commit.
            expect(await tx3.commit()).toBe(false);
            expect(await backend1.get('key6')).toBe(undefined);
            expect(await backend2.get('key6')).toBe(undefined);
        })().then(done, done.fail);
    });

    it('scenario 3: complex flush after abort', (done) => {
        (async function () {
            // Create two transactions in different object stores.
            const tx1 = objectStore1.transaction();
            const tx2 = objectStore2.transaction();
            const tx3 = objectStore2.transaction();
            await tx1.remove('key6');
            await tx2.remove('key6');

            expect(await tx2.commit()).toBe(true);
            // Create a transaction on top of tx2.
            const tx4 = objectStore2.transaction();
            await tx4.put('test', 'successful');
            // Create a second transaction on top of tx2.
            const tx5 = objectStore2.transaction();

            // Commit tx4 and tx1.
            expect(await JungleDB.commitCombined(tx1, tx4)).toBe(true);
            // Hence the object store will be updated.
            expect(await objectStore1.get('key6')).toBe(undefined);
            expect(await objectStore2.get('key6')).toBe(undefined);
            expect(await objectStore2.get('test')).toBe('successful');
            // But tx3 should not allow to flush to the backend.
            expect(await backend1.get('key6')).toBe('value6');
            expect(await backend2.get('key6')).toBe('value6');
            expect(await backend2.get('test')).toBe(undefined);

            // Commit tx3 (which should fail) and expect no flush yet.
            expect(await tx3.commit()).toBe(false);
            expect(await objectStore1.get('key6')).toBe(undefined);
            expect(await objectStore2.get('key6')).toBe(undefined);
            expect(await objectStore2.get('test')).toBe('successful');
            // But tx5 should not allow to flush to the backend.
            expect(await backend1.get('key6')).toBe('value6');
            expect(await backend2.get('test')).toBe(undefined);

            // Commit tx5 (which should fail) and expect flushed data.
            expect(await tx5.commit()).toBe(false);
            expect(await objectStore1.get('key6')).toBe(undefined);
            expect(await objectStore2.get('key6')).toBe(undefined);
            expect(await objectStore2.get('test')).toBe('successful');
            expect(await backend1.get('key6')).toBe(undefined);
            expect(await backend2.get('key6')).toBe(undefined);
            expect(await backend2.get('test')).toBe('successful');
        })().then(done, done.fail);
    });

    it('scenario 4: no combined nested transactions', (done) => {
        (async function () {
            // Create three transactions in two different object stores and one nested.
            const tx1 = objectStore1.transaction();
            const tx2 = objectStore2.transaction();
            const tx3 = objectStore1.transaction();
            await tx1.remove('key6');
            await tx2.remove('key6');
            const nested = tx1.transaction();
            await nested.put('test', 'successful');

            // Cannot commit combined transactions including a nested transaction.
            try {
                await JungleDB.commitCombined(nested, tx2);
                expect(false).toBe(true);
            } catch (e) {
                expect(true).toBe(true);
            }
        })().then(done, done.fail);
    });

    it('scenario 5: simple fail', (done) => {
        (async function () {
            // Create three transactions in two different object stores.
            const tx1 = objectStore1.transaction();
            const tx2 = objectStore2.transaction();
            const tx3 = objectStore1.transaction();
            await tx1.remove('key6');
            await tx2.remove('key6');

            expect(await tx3.commit()).toBe(true);

            // Commit and fail (not all tx are committable because of conflict).
            expect(await JungleDB.commitCombined(tx1, tx2)).toBe(false);
            expect(await objectStore1.get('key6')).toBe('value6');
            expect(await objectStore2.get('key6')).toBe('value6');
            expect(await backend1.get('key6')).toBe('value6');
            expect(await backend2.get('key6')).toBe('value6');
        })().then(done, done.fail);
    });

    it('scenario 6: complex merge of two combined commits', (done) => {
        (async function () {
            // Create transactions in different object stores.
            const tx1 = objectStore1.transaction();
            const tx2 = objectStore1.transaction();
            const tx3 = objectStore2.transaction();

            await tx1.remove('key6');
            await tx3.remove('key6');

            // Commit two transactions.
            expect(await JungleDB.commitCombined(tx1, tx3)).toBe(true);
            // Nothing should be flushed, OS3 should be updated.
            expect(await objectStore1.get('key6')).toBe(undefined);
            expect(await objectStore2.get('key6')).toBe(undefined);
            expect(await backend1.get('key6')).toBe('value6');
            expect(await backend2.get('key6')).toBe('value6');

            const tx4 = objectStore1.transaction();
            const tx5 = objectStore2.transaction();
            const tx6 = objectStore2.transaction();
            await tx4.put('test', 'successful');
            await tx5.put('test', 'successful');

            // Next, commit remaining transactions (except tx4) in combination.
            expect(await JungleDB.commitCombined(tx4, tx5)).toBe(true);
            // And everything should be updated, nothing flushed.
            expect(await objectStore1.get('key6')).toBe(undefined);
            expect(await objectStore1.get('test')).toBe('successful');
            expect(await objectStore2.get('key6')).toBe(undefined);
            expect(await objectStore2.get('test')).toBe('successful');
            expect(await backend1.get('key6')).toBe('value6');
            expect(await backend1.get('test')).toBe(undefined);
            expect(await backend2.get('key6')).toBe('value6');
            expect(await backend2.get('test')).toBe(undefined);

            // Abort tx2, now key6 should be removed.
            await tx2.abort();

            expect(await backend1.get('key6')).toBe(undefined);
            expect(await backend1.get('test')).toBe(undefined);
            expect(await backend2.get('key6')).toBe(undefined);
            expect(await backend2.get('test')).toBe(undefined);

            // Abort tx6, now test should be present.
            await tx6.abort();

            expect(await backend1.get('key6')).toBe(undefined);
            expect(await backend1.get('test')).toBe('successful');
            expect(await backend2.get('key6')).toBe(undefined);
            expect(await backend2.get('test')).toBe('successful');
        })().then(done, done.fail);
    });

    it('can instantly read the correct value', (done) => {
        (async function () {
            // Create two transactions in different object stores.
            const tx1 = objectStore1.transaction();
            const tx2 = objectStore2.transaction();
            // Add 7 objects.
            for (let i=0; i<7; ++i) {
                await tx1.put(`key${i}`, `newvalue${i}`);
                await tx2.put(`key${i}`, `newvalue${i}`);
            }

            // Commit both (which should immediately update the backend as well).
            expect(await tx1.get('key6')).toBe('newvalue6');
            expect(await tx2.get('key6')).toBe('newvalue6');
            expect(await JungleDB.commitCombined(tx1, tx2)).toBe(true);
            expect(await objectStore2.get('key6')).toBe('newvalue6');
            expect(await objectStore1.get('key6')).toBe('newvalue6');
        })().then(done, done.fail);
    });

    it('does not infinitely stack combined transactions', (done) => {
        (async function () {
            const blockingTx1 = objectStore1.transaction();
            const blockingTx2 = objectStore2.transaction();

            let tx1 = objectStore1.transaction();
            let tx2 = objectStore2.transaction();
            await tx1.remove('key6');
            await tx2.remove('key6');

            expect(await JungleDB.commitCombined(tx1, tx2)).toBe(true);
            expect(objectStore1._stateStack.length).toBe(1);
            expect(objectStore2._stateStack.length).toBe(1);

            tx1 = objectStore1.transaction();
            tx2 = objectStore2.transaction();
            await tx1.remove('key5');
            await tx2.remove('key5');

            expect(await JungleDB.commitCombined(tx1, tx2)).toBe(true);
            expect(objectStore1._stateStack.length).toBe(2);
            expect(objectStore2._stateStack.length).toBe(2);

            tx1 = objectStore1.transaction();
            tx2 = objectStore2.transaction();
            await tx1.remove('key4');
            await tx2.remove('key4');

            expect(await JungleDB.commitCombined(tx1, tx2)).toBe(true);
            expect(objectStore1._stateStack.length).toBe(3);
            expect(objectStore2._stateStack.length).toBe(3);

            await blockingTx1.abort();

            expect(objectStore1._stateStack.length).toBe(3);
            expect(objectStore2._stateStack.length).toBe(3);

            await blockingTx2.abort();

            expect(objectStore1._stateStack.length).toBe(0);
            expect(objectStore2._stateStack.length).toBe(0);
        })().then(done, done.fail);
    });

    it('does not infinitely stack 3 combined transactions', (done) => {
        (async function () {
            const backend3 = new InMemoryBackend('');
            const objectStore3 = new ObjectStore(backend3, null);

            const blockingTx1 = objectStore1.transaction();
            const blockingTx2 = objectStore2.transaction();
            const blockingTx3 = objectStore3.transaction();

            let tx1 = objectStore1.transaction();
            let tx2 = objectStore2.transaction();
            let tx3 = objectStore3.transaction();
            await tx1.remove('key6');
            await tx2.remove('key6');
            await tx3.put('key6', 'test');

            expect(await JungleDB.commitCombined(tx1, tx2, tx3)).toBe(true);
            expect(objectStore1._stateStack.length).toBe(1);
            expect(objectStore2._stateStack.length).toBe(1);
            expect(objectStore3._stateStack.length).toBe(1);

            tx1 = objectStore1.transaction();
            tx2 = objectStore2.transaction();
            tx3 = objectStore3.transaction();
            await tx1.remove('key5');
            await tx2.remove('key5');
            await tx3.put('key5', 'test');

            expect(await JungleDB.commitCombined(tx1, tx2, tx3)).toBe(true);
            expect(objectStore1._stateStack.length).toBe(2);
            expect(objectStore2._stateStack.length).toBe(2);
            expect(objectStore3._stateStack.length).toBe(2);

            tx1 = objectStore1.transaction();
            tx2 = objectStore2.transaction();
            tx3 = objectStore3.transaction();
            await tx1.remove('key4');
            await tx2.remove('key4');
            await tx3.put('key4', 'test');

            expect(await JungleDB.commitCombined(tx1, tx2, tx3)).toBe(true);
            expect(objectStore1._stateStack.length).toBe(3);
            expect(objectStore2._stateStack.length).toBe(3);
            expect(objectStore3._stateStack.length).toBe(3);

            await blockingTx1.abort();

            expect(objectStore1._stateStack.length).toBe(3);
            expect(objectStore2._stateStack.length).toBe(3);
            expect(objectStore3._stateStack.length).toBe(3);

            await blockingTx2.abort();

            expect(objectStore1._stateStack.length).toBe(3);
            expect(objectStore2._stateStack.length).toBe(3);
            expect(objectStore3._stateStack.length).toBe(3);

            await blockingTx3.abort();

            expect(objectStore1._stateStack.length).toBe(0);
            expect(objectStore2._stateStack.length).toBe(0);
            expect(objectStore3._stateStack.length).toBe(0);
        })().then(done, done.fail);
    });
});
