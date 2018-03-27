describe('JSONUtils', () => {

    const simpleObjects = [
        {
            a: [1, 2, 3],
            b: 'test'
        },
        {
            a: [1, 2, 3],
            b: {
                c: 5,
                d: '6'
            }
        }
    ];

    it('can stringify simple objects', () => {
        for (const o of simpleObjects) {
            expect(JSONUtils.stringify(o)).toBe(JSON.stringify(o));
        }
    });

    it('can parse simple objects', () => {
        for (const o of simpleObjects) {
            expect(JSONUtils.stringify(JSONUtils.parse(JSON.stringify(o)))).toBe(JSON.stringify(o));
        }
    });

    it('can convert complex objects', () => {
        let obj = { a: new Uint8Array(10) };
        let obj2 = JSONUtils.parse(JSONUtils.stringify(obj));

        // Compare objects.
        expect(obj2.a instanceof Uint8Array).toBe(true);
        expect(obj2.a.length).toBe(10);
        for (let i = 0; i < 10; ++i) {
            expect(obj2.a[i]).toBe(0);
        }

        obj = { a: Set.from([1, 2, 3]) };
        obj2 = JSONUtils.parse(JSONUtils.stringify(obj));

        // Compare objects.
        expect(obj2.a instanceof Set).toBe(true);
        expect(obj2.a.size).toBe(3);
        for (let i = 0; i < 3; ++i) {
            expect(obj2.a.has(i+1)).toBe(true);
        }

        obj = { a: new Uint8Array(10), b: 5 };
        obj2 = JSONUtils.parse(JSONUtils.stringify(obj));

        // Compare objects.
        expect(obj2.a instanceof Uint8Array).toBe(true);
        expect(obj2.a.length).toBe(10);
        for (let i = 0; i < 10; ++i) {
            expect(obj2.a[i]).toBe(0);
        }
        expect(obj2.b).toBe(5);
    });

    it('can handle null values', () => {
        let obj = { a: null };
        let obj2 = JSONUtils.parse(JSONUtils.stringify(obj));

        // Compare objects.
        expect(obj2.a).toBe(null);
    });

});
