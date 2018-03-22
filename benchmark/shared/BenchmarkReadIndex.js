if (typeof(require) !== 'undefined') {
    Benchmark = require('./Benchmark.js');
    BenchmarkUtils = require('./BenchmarkUtils.js');
    RandomGenerator = require('./RandomGenerator.js');
}

class BenchmarkReadIndex extends Benchmark {
    /**
     * A Benchmark where random, already existing database entries get read.
     * @param databaseEntryCount
     * @param readCount
     * @param entrySize
     * @param batchSize
     * @param sync
     */
    constructor({ databaseEntryCount, readCount, entrySize, batchSize, sync }) {
        if (readCount>databaseEntryCount || batchSize>databaseEntryCount
            || (batchSize===1 && !sync)) { // we ignore this setting as it is the same as batchSize 1 with sync
            throw('Illegal parameter combination.');
        }
        const indices = {};
        indices[BenchmarkReadIndex.TABLE_NAME] = { name: 'index', keyPath: 'index' };
        super(BenchmarkReadIndex.NAME, BenchmarkReadIndex.VERSION, [BenchmarkReadIndex.TABLE_NAME], indices);
        this._databaseEntryCount = databaseEntryCount;
        this._readCount = readCount;
        this._entrySize = entrySize;
        this._batchSize = batchSize;
        this._sync = sync;
        this._entryKeys = BenchmarkUtils.createRandomKeys(databaseEntryCount);
        this._indexKeys = BenchmarkUtils.createRandomKeys(databaseEntryCount);
        this.description = `${BenchmarkReadIndex.NAME},${databaseEntryCount} entries,`
            + `read ${readCount} entries,${entrySize} B/entry,,${batchSize} ops/tx,`
            + `${this._sync? '' : 'a'}sync`;
    }


    async _init() {
        await super._init();
        // fill up the database
        const objectStore = this._db.getObjectStore(BenchmarkReadIndex.TABLE_NAME);
        await BenchmarkUtils.fillObjectStoreWithIndex(objectStore, this._databaseEntryCount, this._entrySize, 1000, false,
            this._entryKeys, this._indexKeys);
    }


    async _benchmark(stats) {
        const readKeys = [];
        for (let i=0; i<this._readCount; ++i) {
            readKeys.push(RandomGenerator.getRandomEntry(this._indexKeys));
        }
        const readOperation = (transaction, index) => {
            const key = readKeys[index];
            const i = transaction.index('index');
            return i.values(this.jdb.KeyRange.only(key));
        };
        const objectStore = this._db.getObjectStore(BenchmarkReadIndex.TABLE_NAME);
        const result = await BenchmarkUtils.performBatchOperation(objectStore, this._readCount, this._batchSize,
            this._sync, readOperation);
        if (!result.results.every(entry => !!entry)) {
            console.error('Error reading data from database.');
        }
        stats.addReads(this._readCount, this._readCount * this._entrySize, result.totalTime);
    }
}
BenchmarkReadIndex.NAME = 'benchmark-read-index';
BenchmarkReadIndex.TABLE_NAME = 'default';
BenchmarkReadIndex.VERSION = 1;

if (typeof(module) !== 'undefined') {
    module.exports = BenchmarkReadIndex;
}
