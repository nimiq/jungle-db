describe('BTree', () => {
    it('can insert and iterate', () => {
        const btree = new BTree();

        for (let i = 0; i < 20; i++) {
            btree.insert(i, `value${i}`);
        }

        expect(btree.length).toBe(20);

        // Iterate ascending
        expect(btree.goTop()).toBe(true);
        expect(btree.currentKey).toBe(0);
        expect(btree.currentRecord).toBe('value0');
        expect(btree.keynum()).toBe(1);

        let currentValue = 0;
        while (btree.skip()) {
            currentValue++;
            expect(btree.currentKey).toBe(currentValue);
            expect(btree.currentRecord).toBe(`value${currentValue}`);
            expect(btree.keynum()).toBe(currentValue + 1);
        }

        expect(btree.currentKey).toBe(null);
        expect(btree.currentRecord).toBe(null);
        expect(btree.keynum()).toBe(-1);

        // Iterate descending
        expect(btree.goBottom()).toBe(true);
        expect(btree.currentKey).toBe(19);
        expect(btree.currentRecord).toBe('value19');
        expect(btree.keynum()).toBe(20);

        currentValue = 19;
        while (btree.skip(-1)) {
            currentValue--;
            expect(btree.currentKey).toBe(currentValue);
            expect(btree.currentRecord).toBe(`value${currentValue}`);
            expect(btree.keynum()).toBe(currentValue + 1);
        }

        expect(btree.currentKey).toBe(null);
        expect(btree.currentRecord).toBe(null);
        expect(btree.keynum()).toBe(-1);

        // Skip more than 1
        expect(btree.goTop()).toBe(true);
        expect(btree.currentKey).toBe(0);
        expect(btree.currentRecord).toBe('value0');
        expect(btree.keynum()).toBe(currentValue + 1);

        currentValue = 0;
        while (btree.skip(2)) {
            currentValue += 2;
            expect(btree.currentKey).toBe(currentValue);
            expect(btree.currentRecord).toBe(`value${currentValue}`);
            expect(btree.keynum()).toBe(currentValue + 1);
        }
    });

    it('behaves correctly when empty', () => {
        const btree = new BTree();
        expect(btree.length).toBe(0);
        expect(btree.goTop()).toBe(false);
        expect(btree.goBottom()).toBe(false);
        expect(btree.goToLowerBound(1)).toBe(false);
        expect(btree.goToUpperBound(1)).toBe(false);
        expect(btree.goto(2)).toBe(false);
        expect(btree.remove(3)).toBe(false);
        expect(btree.seek(2)).toBe(false);
        expect(btree.skip(2)).toBe(false);
        expect(btree.currentKey).toBe(null);
        expect(btree.currentRecord).toBe(null);
    });

    it('can insert, remove, iterate and pack', () => {
        const btree = new BTree();

        for (let i = 0; i < 20; i++) {
            btree.insert(i, `value${i}`);
        }

        expect(btree.length).toBe(20);

        // Iterate uneven numbers ascending
        expect(btree.goToLowerBound(0, true)).toBe(true);
        expect(btree.currentKey).toBe(1);
        expect(btree.currentRecord).toBe('value1');
        expect(btree.keynum()).toBe(2);
        expect(btree.remove(1)).toBe(true);

        let currentValue = 1;
        while (btree.skip()) {
            currentValue += 2;
            expect(btree.currentKey).toBe(currentValue);
            expect(btree.currentRecord).toBe(`value${currentValue}`);
            expect(btree.keynum()).toBe((currentValue + 1) / 2 + 1);
            expect(btree.remove(currentValue)).toBe(true);
        }

        expect(btree.length).toBe(10);
        expect(btree.pack()).toBe(true);
    });

    it('can insert and remove everything', () => {
        const btree = new BTree();

        for (let i = 0; i < 20; i++) {
            btree.insert(i, `value${i}`);
        }

        for (let i = 0; i < 20; i++) {
            expect(btree.remove(i)).toBe(true);
        }

        expect(btree.length).toBe(0);
        expect(btree.goTop()).toBe(false);
        expect(btree.goBottom()).toBe(false);
        expect(btree.goToLowerBound(1)).toBe(false);
        expect(btree.goToUpperBound(1)).toBe(false);
        expect(btree.goto(2)).toBe(false);
        expect(btree.remove(3)).toBe(false);
        expect(btree.seek(2)).toBe(false);
        expect(btree.skip(2)).toBe(false);
        expect(btree.currentKey).toBe(null);
        expect(btree.currentRecord).toBe(null);
    });

    it('can use goto', () => {
        const btree = new BTree();

        for (let i = 0; i < 20; i++) {
            btree.insert(i, `value${i}`);
        }

        expect(btree.goto(5)).toBe(true);
        expect(btree.currentKey).toBe(4);
        expect(btree.currentRecord).toBe('value4');
    });

    it('can go to open bounds', () => {
        const btree = new BTree();

        btree.insert(123, 'test');
        btree.insert(124, 'test');

        expect(btree.goToLowerBound(1, true)).toBe(true);
        expect(btree.currentKey).toBe(123);
        expect(btree.currentRecord).toBe('test');
    });
});
