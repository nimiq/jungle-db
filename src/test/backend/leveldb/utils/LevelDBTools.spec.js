describe('LevelDBTools', () => {

    it('correctly converts exact queries', () => {
        const q = LevelDBTools.convertKeyRange(KeyRange.only(3));
        expect(q).toEqual({
            'gte': 3,
            'lte': 3
        });
    });

    it('correctly converts lower bounds', () => {
        let q = LevelDBTools.convertKeyRange(KeyRange.lowerBound(5, false));
        expect(q).toEqual({
            'gte': 5
        });
        q = LevelDBTools.convertKeyRange(KeyRange.lowerBound(3, true));
        expect(q).toEqual({
            'gt': 3
        });
    });

    it('correctly converts upper bounds', () => {
        let q = LevelDBTools.convertKeyRange(KeyRange.upperBound(5, false));
        expect(q).toEqual({
            'lte': 5
        });
        q = LevelDBTools.convertKeyRange(KeyRange.upperBound(3, true));
        expect(q).toEqual({
            'lt': 3
        });
    });

    it('correctly converts range queries', () => {
        let q = LevelDBTools.convertKeyRange(KeyRange.bound(2, 5, false, false));
        expect(q).toEqual({
            'gte': 2,
            'lte': 5
        });
        q = LevelDBTools.convertKeyRange(KeyRange.bound(2, 5, true, false));
        expect(q).toEqual({
            'gt': 2,
            'lte': 5
        });
        q = LevelDBTools.convertKeyRange(KeyRange.bound(2, 5, false, true));
        expect(q).toEqual({
            'gte': 2,
            'lt': 5
        });
        q = LevelDBTools.convertKeyRange(KeyRange.bound(2, 5, true, true));
        expect(q).toEqual({
            'gt': 2,
            'lt': 5
        });
    });
});
