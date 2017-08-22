if (typeof(require) !== 'undefined') {
    Benchmark = require('./Benchmark.js');
    BenchmarkUtils = require('./BenchmarkUtils.js');
    RandomGenerator = require('./RandomGenerator.js');
}

class BenchmarkOverwrite extends Benchmark {
    /**
     * A Benchmark where random, already existing database entries get overwritten.
     * @param databaseEntryCount
     * @param overwriteCount
     * @param entrySize
     * @param batchSize - how many entries to write within one transaction
     */
    constructor({ databaseEntryCount, overwriteCount, entrySize, batchSize, sync }) {
        if (overwriteCount>databaseEntryCount || batchSize>databaseEntryCount
            || (batchSize===1 && !sync)) { // we ignore this setting as it is the same as batchSize 1 with sync
            throw('Illegal parameter combination.');
        }
        super(BenchmarkOverwrite.NAME, BenchmarkOverwrite.VERSION, [BenchmarkOverwrite.TABLE_NAME]);
        this._databaseEntryCount = databaseEntryCount;
        this._overwriteCount = overwriteCount;
        this._entrySize = entrySize;
        this._batchSize = batchSize;
        this._sync = sync;
        this._entryKeys = BenchmarkUtils.createRandomKeys(databaseEntryCount);
        this.description = `${BenchmarkOverwrite.NAME}, ${databaseEntryCount} entries in database, `
            + `overwrite ${overwriteCount} entries, ${entrySize} Bytes per entry, batch size ${batchSize}, `
            + `${this._sync? '' : 'a'}sync`;
    }


    /**
     * @overwrite
     */
    async _init() {
        await super._init();
        // fill up the database
        const objectStore = this._db.getObjectStore(BenchmarkOverwrite.TABLE_NAME);
        await BenchmarkUtils.fillObjectStore(objectStore, this._databaseEntryCount, this._entrySize, 1000, false,
            this._entryKeys);
    }


    async _benchmark(stats) {
        const overwriteKeys = [];
        for (let i=0; i<this._overwriteCount; ++i) {
            overwriteKeys.push(RandomGenerator.getRandomEntry(this._entryKeys));
        }
        const objectStore = this._db.getObjectStore(BenchmarkOverwrite.TABLE_NAME);
        await BenchmarkUtils.fillObjectStore(objectStore, this._overwriteCount, this._entrySize,
            this._batchSize, this._sync, overwriteKeys, stats);
    }
}
BenchmarkOverwrite.NAME = 'benchmark-overwrite';
BenchmarkOverwrite.TABLE_NAME = 'default';
BenchmarkOverwrite.VERSION = 1;

if (typeof(module) !== 'undefined') {
    module.exports = BenchmarkOverwrite;
}
