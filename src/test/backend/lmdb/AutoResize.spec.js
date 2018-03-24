describe('AutoResize', () => {

    it('automatically resizes database if needed', (done) => {
        (async function () {
            // Create a small database and try to fill it.
            let db = new JungleDB('test', 1, undefined, { maxDbSize: 1024*1024, maxDbs: 10, autoResize: true });
            let st = db.createObjectStore('testStore');
            await db.connect();

            expect(db.info().mapSize).toBe(1024*1024);

            let longStr = 'l';
            for (let i = 0; i < 512; i++) {
                longStr += 'o';
            }
            longStr += 'ng';

            for (let i = 0; i < 1024; i++) {
                try {
                    await st.put(`key${i}`, `${longStr} value for key at position ${i}`);
                } catch (e) {
                    expect(false).toBe(true);
                }
            }

            expect(db.info().mapSize).toBeGreaterThan(1024*1024);

            await db.close();

            // Try reconnect.
            db = new JDB.JungleDB('test', 1, undefined, { maxDbSize: 1024, maxDbs: 10, autoResize: true });
            await db.connect();
            expect(db.info().mapSize).toBeGreaterThan(1024*1024);
            await db.destroy();
        })().then(done, done.fail);
    });
});
