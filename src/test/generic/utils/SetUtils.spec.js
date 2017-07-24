describe('SetUtils', () => {

    it('correctly computes the union of two sets', () => {
        const setA = new Set([1, 2, 3, 4, 5]);
        const setB = new Set([3, 4, 5, 6, 7, 8]);
        const union = setA.union(setB);
        expect(union).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8]));
    });

    it('correctly computes the intersection of two sets', () => {
        const setA = new Set([1, 2, 3, 4, 5]);
        const setB = new Set([3, 4, 5, 6, 7, 8]);
        const union = setA.intersection(setB);
        expect(union).toEqual(new Set([3, 4, 5]));
    });

    it('correctly computes the difference of two sets', () => {
        const setA = new Set([1, 2, 3, 4, 5]);
        const setB = new Set([3, 4, 5, 6, 7, 8]);
        const union = setA.difference(setB);
        expect(union).toEqual(new Set([1, 2]));
    });

    it('constructs a set from various types', () => {
        expect(Set.from(152)).toEqual(new Set([152]));
        expect(Set.from([1, 2, 3])).toEqual(new Set([1, 2, 3]));
        expect(Set.from({ '1': 5 })).toEqual(new Set([{ '1': 5 }]));
        expect(Set.from(new Set([5, 3]))).toEqual(new Set([5, 3]));
        const map = new Map();
        map.set(354, 124);
        expect(Set.from(map)).toEqual(new Set([[354, 124]]));
    });
});
