describe('ObjectUtils', () => {

    it('correctly retrieves simple properties from objects', () => {
        const obj = {
            test: 'success'
        };
        expect(ObjectUtils.byKeyPath(obj, 'test')).toEqual('success');
    });

    it('correctly retrieves complex properties from objects', () => {
        const obj = {
            complex: {
                test: {
                    case: 'success'
                }
            }
        };
        expect(ObjectUtils.byKeyPath(obj, 'complex|test|case'.split('|'))).toEqual('success');
    });

    it('correctly retrieves simple properties from classes', () => {
        class Test {
            constructor() {
                this.test2 = 'member';
            }

            get test() {
                return 'success';
            }
        }
        const obj = new Test();
        expect(ObjectUtils.byKeyPath(obj, 'test')).toEqual('success');
        expect(ObjectUtils.byKeyPath(obj, 'test2')).toEqual('member');
    });

    it('correctly retrieves complex properties from classes', () => {
        class Test {
            constructor() {
                this._privateTest = {
                    'another': 'example'
                };
            }

            get test() {
                return new Test();
            }
        }
        const obj = new Test();
        expect(ObjectUtils.byKeyPath(obj, '_privateTest|another'.split('|'))).toEqual('example');
        expect(ObjectUtils.byKeyPath(obj, 'test|_privateTest|another'.split('|'))).toEqual('example');
    });
});
