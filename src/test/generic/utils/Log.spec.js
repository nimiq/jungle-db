describe('Log', () => {

    beforeAll(() => {
        spyOn(console, 'log');
        spyOn(console, 'error');
    });

    it('can log objects', () => {
        expect(() => Log.i('Test', { toString: () => '' })).not.toThrow();

        expect(() => Log.i('Test', TestCodec.instance)).not.toThrow();

        expect(() => Log.i('Test', {})).not.toThrow();
    });

    it('can log info', () => {
        expect(() => Log.i('Test')).not.toThrow();

        expect(() => Log.i('Test', 'test')).not.toThrow();
    });

    it('can log debug', () => {
        expect(() => Log.d('Test')).not.toThrow();

        expect(() => Log.d('Test', 'test')).not.toThrow();
    });

    it('can log warning', () => {
        expect(() => Log.w('Test')).not.toThrow();

        expect(() => Log.w('Test', 'test')).not.toThrow();
    });

    it('can log trace', () => {
        expect(() => Log.t('Test')).not.toThrow();

        expect(() => Log.t('Test', 'test')).not.toThrow();
    });

    it('can log verbose', () => {
        expect(() => Log.v('Test')).not.toThrow();

        expect(() => Log.v('Test', 'test')).not.toThrow();
    });

    it('can log error', () => {
        expect(() => Log.e('Test')).not.toThrow();

        expect(() => Log.e('Test', 'test')).not.toThrow();
    });
});
