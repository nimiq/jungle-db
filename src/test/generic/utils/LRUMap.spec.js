describe('LRUMap', () => {

    it('does can store key-value pairs', () => {
        const lru = new LRUMap(10);

        // Fill map.
        for (let i=0; i<10; ++i) {
            lru.set(`key${i}`, `value${i}`);
        }

        // Check contents.
        for (let i=0; i<10; ++i) {
            expect(lru.get(`key${i}`)).toEqual(`value${i}`);
        }
    });

    it('evicts old entries', () => {
        const lru = new LRUMap(2);

        // Fill map.
        for (let i=0; i<3; ++i) {
            lru.set(`key${i}`, `value${i}`);
        }

        // Check contents.
        for (let i=0; i<3; ++i) {
            expect(lru.has(`key${i}`)).toEqual(i > 0);
        }
    });

    it('does not evict recently accessed entries', () => {
        const lru = new LRUMap(2);

        // Fill map.
        for (let i=0; i<3; ++i) {
            lru.set(`key${i}`, `value${i}`);
            if (i === 1) {
                lru.get(`key0`);
            }
        }

        // Check contents.
        for (let i=0; i<3; ++i) {
            expect(lru.has(`key${i}`)).toEqual(i !== 1);
        }
    });

    it('has a working iterator', () => {
        const lru = new LRUMap(3);

        // Fill map.
        for (let i=0; i<3; ++i) {
            lru.set(`key${i}`, `value${i}`);
            if (i === 1) {
                lru.get(`key0`);
            }
        }

        // Check contents.
        for (const [key, value] of lru) {
            expect(key.startsWith('key')).toEqual(true);
            expect(value.startsWith('value')).toEqual(true);
        }
    });

    it('can evict multiple entries', () => {
        const lru = new LRUMap(3);

        // Fill map.
        for (let i=0; i<3; ++i) {
            lru.set(`key${i}`, `value${i}`);
        }

        lru.evict(2);

        // Check contents.
        for (const [key, value] of lru) {
            expect(key).toEqual('key2');
            expect(value).toEqual('value2');
        }
    });

    it('can be cleared', () => {
        const lru = new LRUMap(3);

        // Fill map.
        for (let i=0; i<3; ++i) {
            lru.set(`key${i}`, `value${i}`);
        }

        lru.clear();

        // Check contents.
        for (const [key, value] of lru) {
            expect(true).toEqual(false);
        }
    });
});
