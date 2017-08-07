if (typeof(require) !== 'undefined') {
    Benchmark = require('./Benchmark.js');
    BenchmarkUtils = require('./BenchmarkUtils.js');
    RandomGenerator = require('./RandomGenerator.js');
}

class BenchmarkRead extends Benchmark {
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
        super(BenchmarkRead.NAME, BenchmarkRead.VERSION, [BenchmarkRead.TABLE_NAME]);
        this._databaseEntryCount = databaseEntryCount;
        this._readCount = readCount;
        this._entrySize = entrySize;
        this._batchSize = batchSize;
        this._sync = sync;
        this._entryKeys = BenchmarkUtils.createRandomKeys(databaseEntryCount);
        this.description = `${BenchmarkRead.NAME}, ${databaseEntryCount} entries in database, `
            + `read ${readCount} entries, ${entrySize} Bytes per entry, batch size ${batchSize}, `
            + `${this._sync? '' : 'a'}sync`;
    }


    async _init() {
        await super._init();
        // fill up the database
        const objectStore = this._db.getObjectStore(BenchmarkFill.TABLE_NAME);
        await BenchmarkUtils.fillObjectStore(objectStore, this._databaseEntryCount, this._entrySize, 1000, false,
            this._entryKeys);
    }


    async _benchmark(stats) {
        const readKeys = [];
        for (let i=0; i<this._readCount; ++i) {
            readKeys.push(RandomGenerator.getRandomEntry(this._entryKeys));
        }
        const readOperation = (transaction, index) => {
            const key = readKeys[index];
            return transaction.get(key);
        };
        const objectStore = this._db.getObjectStore(BenchmarkRead.TABLE_NAME);
        const result = await BenchmarkUtils.performBatchOperation(objectStore, this._readCount, this._batchSize,
            this._sync, readOperation);
        if (!result.results.every(entry => !!entry)) {
            console.error('Error reading data from database.');
        }
        stats.addReads(this._readCount, this._readCount * this._entrySize, result.totalTime);
    }
}
BenchmarkRead.NAME = 'benchmark-read';
BenchmarkRead.TABLE_NAME = 'default';
BenchmarkRead.VERSION = 1;

if (typeof(module) !== 'undefined') {
    module.exports = BenchmarkRead;
}
