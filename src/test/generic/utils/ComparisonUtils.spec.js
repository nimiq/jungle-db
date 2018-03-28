describe('ComparisonUtils', () => {
    it('has an equals method', () => {
        const buffer1 = new Uint8Array([ 116, 101, 115, 116 ]);
        const buffer2 = new Uint8Array([ 116, 101, 115, 116 ]);
        const buffer3 = new Uint8Array([ 116, 101, 115, 116, 32, 102, 97, 108, 115, 101 ]);

        const i1 = 1;
        const i2 = 1;
        const i3 = 5;

        const s1 = 'test';
        const s2 = 'test';
        const s3 = 'test false';

        const set1 = new Set([1, 2]);
        const set2 = new Set([2, 1]);
        const set3 = new Set([1, 2, 3]);

        expect(ComparisonUtils.equals(buffer1, buffer2)).toEqual(true);
        expect(ComparisonUtils.equals(buffer1, buffer3)).toEqual(false);

        expect(ComparisonUtils.equals(i1, i2)).toEqual(true);
        expect(ComparisonUtils.equals(i1, i3)).toEqual(false);

        expect(ComparisonUtils.equals(s1, s2)).toEqual(true);
        expect(ComparisonUtils.equals(s1, s3)).toEqual(false);

        expect(ComparisonUtils.equals(set1, set2)).toEqual(true);
        expect(ComparisonUtils.equals(set1, set3)).toEqual(false);

        expect(ComparisonUtils.equals(buffer1, i1)).toEqual(false);
        expect(ComparisonUtils.equals(i1, s1)).toEqual(false);
        expect(ComparisonUtils.equals(s1, set1)).toEqual(false);
        expect(ComparisonUtils.equals(set3, buffer3)).toEqual(false);
    });

    it('has a compare method', () => {
        const buffer1 = new Uint8Array([ 116, 101, 115, 116, 65 ]);
        const buffer2 = new Uint8Array([ 116, 101, 115, 116, 66 ]);
        const buffer3 = new Uint8Array([ 116, 101, 115, 116, 67, 32, 102, 97, 108, 115, 101 ]);

        const i1 = 1;
        const i2 = 2;
        const i3 = 5;

        const s1 = 'testA';
        const s2 = 'testB';
        const s3 = 'testC false';

        expect(ComparisonUtils.compare(buffer1, buffer2)).toEqual(-1);
        expect(ComparisonUtils.compare(buffer1, buffer3)).toEqual(-1);
        expect(ComparisonUtils.compare(buffer3, buffer1)).toEqual(1);

        expect(ComparisonUtils.compare(i1, i2)).toEqual(-1);
        expect(ComparisonUtils.compare(i2, i3)).toEqual(-1);
        expect(ComparisonUtils.compare(i3, i1)).toEqual(1);

        expect(ComparisonUtils.compare(s1, s2)).toEqual(-1);
        expect(ComparisonUtils.compare(s2, s3)).toEqual(-1);
        expect(ComparisonUtils.compare(s3, s1)).toEqual(1);
    });
});
