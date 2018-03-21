if (typeof(require) !== 'undefined') {
    Benchmark = require('./Benchmark.js');
    BenchmarkUtils = require('./BenchmarkUtils.js');
    RandomGenerator = require('./RandomGenerator.js');
}

class BenchmarkDelete extends Benchmark {
    /**
     * A Benchmark where random, already existing database entries get deleted.
     * @param databaseEntryCount
     * @param deleteCount
     * @param entrySize
     * @param batchSize
     * @param sync
     */
    constructor({ databaseEntryCount, deleteCount, entrySize, batchSize, sync }) {
        if (deleteCount>databaseEntryCount || batchSize>databaseEntryCount
            || (batchSize===1 && !sync)) { // we ignore this setting as it is the same as batchSize 1 with sync
            throw('Illegal parameter combination.');
        }
        super(BenchmarkDelete.NAME, BenchmarkDelete.VERSION, [BenchmarkDelete.TABLE_NAME]);
        this._databaseEntryCount = databaseEntryCount;
        this._deleteCount = deleteCount;
        this._entrySize = entrySize;
        this._batchSize = batchSize;
        this._sync = sync;
        this._entryKeys = BenchmarkUtils.createRandomKeys(databaseEntryCount);
        this.description = `${BenchmarkDelete.NAME},${databaseEntryCount} entries,`
            + `delete ${deleteCount} entries,${entrySize} B/entry,${batchSize} ops/tx,`
            + `${this._sync? '' : 'a'}sync`;
    }


    async _init() {
        await super._init();
        // fill up the database
        const objectStore = this._db.getObjectStore(BenchmarkDelete.TABLE_NAME);
        await BenchmarkUtils.fillObjectStore(objectStore, this._databaseEntryCount, this._entrySize, 1000, false,
            this._entryKeys);
    }


    async _benchmark(stats) {
        let deleteKeys = new Set();
        while (deleteKeys.size < this._deleteCount) {
            deleteKeys.add(RandomGenerator.getRandomEntry(this._entryKeys));
        }
        deleteKeys = Array.from(deleteKeys);
        const deleteOperation = async (transaction, index) => {
            const key = deleteKeys[index];
            await transaction.remove(key);
        };
        const objectStore = this._db.getObjectStore(BenchmarkDelete.TABLE_NAME);
        const totalTime = (await BenchmarkUtils.performBatchOperation(objectStore, this._deleteCount, this._batchSize,
            this._sync, deleteOperation)).totalTime;
        stats.addWrites(this._deleteCount, this._deleteCount * this._entrySize, totalTime);
    }
}
BenchmarkDelete.NAME = 'benchmark-delete';
BenchmarkDelete.TABLE_NAME = 'default';
BenchmarkDelete.VERSION = 1;

if (typeof(module) !== 'undefined') {
    module.exports = BenchmarkDelete;
}
