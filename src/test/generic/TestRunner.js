class TestRunner {
    /**
     * @param {string} name
     * @param {number} version
     * @param {function(jdb:JungleDB)} setup
     * @param {function(store:ObjectStore):Promise} fill
     * @returns {TestRunner}
     */
    static nativeRunner(name, version, setup, fill) {
        let jdb;
        return new TestRunner('native', (async (additionalSetup) => {
            jdb = new JungleDB(name, version);
            // Run store setup
            const store = setup(jdb);

            // Run additional setup (e.g. indices)
            if (additionalSetup) {
                additionalSetup(store);
            }

            await jdb.connect();
            if (fill) {
                await fill(store);
            }
            return store;
        }), () => {
            return jdb.destroy();
        });
    }

    /**
     * @param {function()} setup
     * @param {function(store:ObjectStore):Promise} fill
     * @returns {TestRunner}
     */
    static volatileRunner(setup, fill) {
        return new TestRunner('volatile', (async (additionalSetup) => {
            const store = setup();

            // Run additional setup (e.g. indices)
            if (additionalSetup) {
                additionalSetup(store);
            }

            if (fill) {
                await fill(store);
            }
            return store;
        }));
    }

    constructor(type, setup, destroy) {
        this._type = type;
        this._setup = setup;
        this._store = null;
        this._destroy = destroy || (() => {});
    }

    /**
     * @param {function(store:ObjectStore)} [additionalSetup]
     * @returns {Promise<null|*>}
     */
    async init(additionalSetup) {
        this._store = await this._setup(additionalSetup);
        return this._store;
    }

    async destroy() {
        return this._destroy();
    }

    /** @type {ObjectStore} */
    get store() {
        return this._store;
    }

    /** @type {string} */
    get type() {
        return this._type;
    }
}
Class.register(TestRunner);
