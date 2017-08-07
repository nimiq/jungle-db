if (typeof(require) !== 'undefined') {
    JungleDB = require('../../dist/node.js').JungleDB;
    Stats = require('./Stats.js');
    BenchmarkUtils = require('./BenchmarkUtils.js');
}

class Benchmark {
    /**
     * @param {string} name
     * @param {number} benchmarkVersion
     * @param {Array.<string>} tableNames
     */
    constructor(name, benchmarkVersion = 1, tableNames = ['default']) {
        this.name = name;
        this._databaseName = `benchmark-${name}`;
        this._tableNames = tableNames;
        this._objectStores = [];
        this._benchmarkVersion = benchmarkVersion;
        this._db = null;
        this.stats = new Stats();
    }

    async _init() {
        this._db = new JungleDB(this._databaseName, this._benchmarkVersion);
        for (const tableName of this._tableNames) {
            this._objectStores.push(this._db.createObjectStore(tableName));
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
        BenchmarkUtils.logColored(`\n\nRun benchmark ${this.description || this.name}:`);
        await this._init();
        const stats = [];
        for (let i=0; i<count; ++i) {
            const runStats = new Stats();
            const startTime = Date.now();
            await this._benchmark(runStats); // eslint-disable-line no-await-in-loop
            const elapsedTime = Date.now() - startTime;
            console.log(`Run ${i+1} took ${elapsedTime/1000} seconds.`);
            console.log(runStats.toString());
            stats.push(runStats);
            if (i<count-1) {
                // if another run follows, reset the benchmark
                await this._reset(); // eslint-disable-line no-await-in-loop
            }
        }
        await this._finalCleanup();
        const averageStats = Stats.averageStats(stats);
        console.log('Average stats:');
        BenchmarkUtils.logColored(averageStats.toString());
        return averageStats;
    }
}

if (typeof(module) !== 'undefined') {
    module.exports = Benchmark;
}
