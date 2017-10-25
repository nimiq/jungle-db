describe('ArrayUtils', () => {

    it('correctly iterates in ascending order', () => {
        const array = [1, 2, 3, 4, 5];
        const it = array.iterator();
        for (let i = 0; i <= array.length; ++i) {
            const hasNext = it.hasNext();
            expect(hasNext).toBe(i < array.length);
            if (hasNext) {
                expect(it.peek()).toBe(array[i]);
                expect(it.next()).toBe(array[i]);
            }
        }
    });

    it('correctly iterates in descending order', () => {
        const array = [1, 2, 3, 4, 5];
        const it = array.iterator(false);
        for (let i = array.length - 1; i >= -1; --i) {
            const hasNext = it.hasNext();
            expect(hasNext).toBe(i >= 0);
            if (hasNext) {
                expect(it.peek()).toBe(array[i]);
                expect(it.next()).toBe(array[i]);
            }
        }
    });
});
