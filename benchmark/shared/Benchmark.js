if (typeof(require) !== 'undefined') {
    Stats = require('./Stats.js');
    BenchmarkUtils = require('./BenchmarkUtils.js');
}

class Benchmark {
    /**
     * @param {string} name
     * @param {number} benchmarkVersion
     * @param {Array.<string>} tableNames
     */
    constructor(name, benchmarkVersion = 1, tableNames = ['default'], indices = {}) {
        this.name = name;
        this._databaseName = `db-${name}`;
        this._tableNames = tableNames;
        this._objectStores = [];
        this._indices = indices;
        this._benchmarkVersion = benchmarkVersion;
        this._db = null;

        this._jdbOptions = {};
        this._jdb = null;
    }

    setJDB(customJDB, options) {
        this._jdb = customJDB;
        this._jdbOptions = options || {};
    }

    get jdb() {
        return this._jdb ? this._jdb : JDB;
    }

    async _init() {
        this._db = new this.jdb.JungleDB(this._databaseName, this._benchmarkVersion, undefined, this._jdbOptions);
        for (const tableName of this._tableNames) {
            const store = this._db.createObjectStore(tableName);
            this._objectStores.push(store);
            if (this._indices[tableName]) {
                const { name, keyPath } = this._indices[tableName];
                store.createIndex(name, keyPath);
            }
        }
        await this._db.connect();
    }

    /**
     * @returns {Promise.<void>}
     * @protected
     */
    async _finalCleanup() {
        if (this._db) {
            await this._db.destroy();
        }
    }

    /**
     * @returns {Promise.<void>}
     * @protected
     */
    async _reset() {}

    /**
     * @param {Stats} stats
     * @protected
     */
    _benchmark(stats) { // eslint-disable-line no-unused-vars
        throw Error('Abstract method needs to be implemented by child class.');
    }

    /**
     * @param {number} count
     * @returns {Promise.<Stats>}
     */
    async run(count = 2) {
        await this._init();
        const stats = [];
        for (let i=0; i<count; ++i) {
            const runStats = new Stats();
            const startTime = Date.now();
            await this._benchmark(runStats); // eslint-disable-line no-await-in-loop
            const elapsedTime = Date.now() - startTime;
            stats.push(runStats);
            if (i<count-1) {
                // if another run follows, reset the benchmark
                await this._reset(); // eslint-disable-line no-await-in-loop
            }
        }
        await this._finalCleanup();
        const averageStats = Stats.averageStats(stats);
        BenchmarkUtils.logColored(`${this.description || this.name},${averageStats.totalTime()}`);
        return averageStats;
    }
}

if (typeof(module) !== 'undefined') {
    module.exports = Benchmark;
}
